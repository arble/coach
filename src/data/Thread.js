const moment = require('moment');

const Eris = require('eris');
const bot = require('../bot');
const knex = require('../knex');
const utils = require('../utils');
const config = require('../config');
const attachments = require('./attachments');
const {messageQueue} = require('../queue');

const ThreadMessage = require('./ThreadMessage');

const {THREAD_MESSAGE_TYPE, THREAD_STATUS, THREAD_GATHER_INFO} = require('./constants');

/**
 * @property {String} id
 * @property {Number} status
 * @property {String} user_id
 * @property {String} user_name
 * @property {String} channel_id
 * @property {String} scheduled_close_at
 * @property {String} scheduled_close_id
 * @property {String} scheduled_close_name
 * @property {Number} scheduled_close_silent
 * @property {String} alert_id
 * @property {String} created_at
 * @property {Boolean} autoreply
 * @property {String} apology_sent_at
 * @property {String} sub_id
 */
class Thread {
  constructor(props) {
    utils.setDataModelProps(this, props);
  }

  /**
   * @param {Eris~Member} moderator
   * @param {String} text
   * @param {Eris~MessageFile[]} replyAttachments
   * @param {Boolean} isAnonymous
   * @returns {Promise<boolean>} Whether we were able to send the reply
   */
  async replyToUser(moderator, text, replyAttachments = [], isAnonymous = false) {
    // Username to reply with
    let modUsername, logModUsername;
    const mainRole = utils.getMainRole(moderator);

    if (isAnonymous) {
      modUsername = (mainRole ? mainRole.name : 'Moderator');
      logModUsername = `(Anonymous) (${moderator.user.username}) ${mainRole ? mainRole.name : 'Moderator'}`;
    } else {
      const name = (config.useNicknames ? moderator.nick || moderator.user.username : moderator.user.username);
      modUsername = (mainRole ? `(${mainRole.name}) ${name}` : name);
      logModUsername = modUsername;
    }

    // Build the reply message
    let dmContent = `**${modUsername}:** ${text}`;
    let threadContent = `⬅️ **${logModUsername}:** ${text}`;
    let logContent = text;

    if (config.threadTimestamps) {
      const timestamp = utils.getTimestamp();
      threadContent = `[${timestamp}] » ${threadContent}`;
    }

    // Prepare attachments, if any
    let files = [];

    if (replyAttachments.length > 0) {
      for (const attachment of replyAttachments) {
        let savedAttachment;

        await Promise.all([
          attachments.attachmentToDiscordFileObject(attachment).then(file => {
            files.push(file);
          }),
          attachments.saveAttachment(attachment).then(result => {
            savedAttachment = result;
          })
        ]);

        logContent += `\n\n**Attachment:** ${savedAttachment.url}`;
      }
    }

    // Send the reply DM
    let dmMessage;
    try {
      dmMessage = await this.postToUser(dmContent, files);
    } catch (e) {
      await this.addThreadMessageToDB({
        message_type: THREAD_MESSAGE_TYPE.COMMAND,
        user_id: moderator.id,
        user_name: logModUsername,
        body: logContent
      });

      await this.postSystemMessage(`Error while replying to user: ${e.message}`);

      return false;
    }

    // Send the reply to the coachmail thread
    await this.postToThreadChannel(threadContent, files);

    // Add the message to the database
    await this.addThreadMessageToDB({
      message_type: THREAD_MESSAGE_TYPE.TO_USER,
      user_id: moderator.id,
      user_name: logModUsername,
      body: logContent,
      is_anonymous: (isAnonymous ? 1 : 0),
      dm_message_id: dmMessage.id
    });

    // hack - treat a user reply as apology
    if (!this.apology_sent_at) {
      await knex('threads')
        .where('id', this.id)
        .update({
          apology_sent_at: moment.utc().format('YYYY-MM-DD HH:mm:ss')
        });
    }

    if (this.scheduled_close_at) {
      await this.cancelScheduledClose();
      await this.postSystemMessage(`Cancelling scheduled closing of this thread due to new reply`);
    }

    return true;
  }

  /**
   * @param {Eris~Message} msg
   * @returns {Promise<void>}
   */
  async receiveUserReply(msg) {
    let content = msg.content;
    if (msg.content.trim() === '' && msg.embeds.length) {
      content = '<message contains embeds>';
    }

    let threadContent = `🗨️ **${msg.author.username}#${msg.author.discriminator}:** ${content}`;
    let logContent = msg.content;

    if (config.threadTimestamps) {
      const timestamp = utils.getTimestamp(msg.timestamp, 'x');
      threadContent = `[${timestamp}] « ${threadContent}`;
    }

    // Prepare attachments, if any
    let attachmentFiles = [];

    for (const attachment of msg.attachments) {
      const savedAttachment = await attachments.saveAttachment(attachment);

      // Forward small attachments (<2MB) as attachments, just link to larger ones
      const formatted = '\n\n' + await utils.formatAttachment(attachment, savedAttachment.url);
      logContent += formatted; // Logs always contain the link

      if (config.relaySmallAttachmentsAsAttachments && attachment.size <= 1024 * 1024 * 2) {
        const file = await attachments.attachmentToDiscordFileObject(attachment);
        attachmentFiles.push(file);
      } else {
        threadContent += formatted;
      }
    }

    if (this.sub_id) {
      if (this.sub_timeout && this.sub_last < moment.utc().subtract(this.sub_timeout, 'MINUTES').format('YYYY-MM-DD HH:mm:ss')) {
        threadContent = `<@!${this.sub_id}> ` + threadContent;
        //await this.postSystemMessage(`<@!${this.sub_id}> New message from ${this.user_name}`);
        await knex('threads')
          .where('id', this.id)
          .update({
            sub_last: moment.utc().format('YYYY-MM-DD HH:mm:ss')
          });
      } else if (!this.sub_timeout) {
        threadContent = `<@!${this.sub_id}> ` + threadContent;
        //await this.postSystemMessage(`<@!${this.sub_id}> New message from ${this.user_name}`);
      }
    }

    await this.postToThreadChannel(threadContent, attachmentFiles);
    await this.addThreadMessageToDB({
      message_type: THREAD_MESSAGE_TYPE.FROM_USER,
      user_id: this.user_id,
      user_name: `${msg.author.username}#${msg.author.discriminator}`,
      body: logContent,
      is_anonymous: 0,
      dm_message_id: msg.id
    });

    // handle the gather info states, if applicable

    if (utils.equalsIC(content, "restart") && this.gather_state < THREAD_GATHER_INFO.COMPLETE) {
      await knex('threads')
      .where('id', this.id)
      .update({
        gather_state: THREAD_GATHER_INFO.PLATFORM
      });
      this.postToUser(config.gatherRestartMessage);
      this.postSystemMessage("User restarted info collection.");
      return;
    }

    if (utils.equalsIC(content, "cancel") && this.gather_state < THREAD_GATHER_INFO.COMPLETE) {
      await messageQueue.add(async () => {
        this.postToUser(config.gatherCancelmessage);
        await this.close(true);
      });
      const logUrl = await this.getLogUrl();
      utils.postLog(utils.trimAll(`
        Coach thread with ${this.user_name} (${this.user_id}) was cancelled by the user before supplying ticket info.
        Logs: ${logUrl}
      `));
      return;
    }

    if (this.gather_state === THREAD_GATHER_INFO.REQUEST) {
      this.finishSurvey(content);
    }

    if (this.scheduled_close_at) {
      await this.cancelScheduledClose();
      await this.postSystemMessage(`<@!${this.scheduled_close_id}> Thread that was scheduled to be closed got a new reply. Cancelling.`);
    }

    if (this.alert_id) {
      await this.setAlert(null);
      await this.postSystemMessage(`<@!${this.alert_id}> New message from ${this.user_name}`);
    }
  }

  async finishSurvey(content) {
    // Look back over the survey messages to get user choices
    const dmChan = await this.getDMChannel();
    const completed = true;
    const userPlatform = utils.getUserReactionChoice(dmChan.id, this.gather_platform);
    if (!userPlatform) {
      completed = false;
    }
    const userRank = utils.getUserReactionChoice(dmChan.id, this.gather_rank);
    if (!userRank) {
      completed = false;
    }
    const userRole = utils.getUserReactionChoice(dmChan.id, this.gather_choice);
    if (!userRole) {
      completed = false;
    }
    if (!completed) {
      const reply = await this.postToUser(config.gatherIncompleteMessage);
      await knex('threads')
      .where('id', this.id)
      .update({
        gather_request: content ? content : this.gather_request,
        gather_state: THREAD_GATHER_INFO.INCOMPLETE
      });
      await bot.addMessageReaction(reply.channel.id, reply.id, '✔️');
      return;
    }

    await knex('threads')
    .where('id', this.id)
    .update({
      gather_request: content,
      gather_state: THREAD_GATHER_INFO.COMPLETE
    });
    this.postToUser(config.gatherCompleteMessage);
    if (config.allowUserClose) {
      this.postToUser(config.userCanCloseMessage);
    }

    const targetCategory = utils.roleToCategory(userRole);

    if (targetCategory) {
      // sanity check the config entry
      const categories = utils.getInboxGuild().channels.filter(c => {
        return (c instanceof Eris.CategoryChannel) && (targetCategory == c.id);
      });

      // this behaviour allows staff to mute the new request category where users are still giving info
      if (categories.length > 0) {
        try {
          await bot.editChannel(this.channel_id, {
            parentID: categories[0].id
          });
        } catch (e) {
          this.postSystemMessage(`Failed to move thread: ${e.message}`);
        }
      }
    }

    // we use content rather than this.gather_request below because it won't populate immediately
    const mention = utils.getInboxMention();
    const userInfo = `${mention}New coaching request:

    **Platform:** ${userPlatform}
    **Rank:** ${userRank}
    **Hero/Role Choice:** ${userRole}
    **Coaching Request:** ${content}

Please remember to "!claim" this request if you take it on.
    `;

    const requestMessage = await bot.createMessage(this.channel_id, {
      content: userInfo,
      disableEveryone: false,
    });
    bot.pinMessage(this.channel_id, requestMessage.id);
    break;
  }

  /**
   * @returns {Promise<PrivateChannel>}
   */
  getDMChannel() {
    return bot.getDMChannel(this.user_id);
  }

  /**
   * @param {String} text
   * @param {Eris~MessageFile|Eris~MessageFile[]} file
   * @returns {Promise<Eris~Message>}
   * @throws Error
   */
  async postToUser(text, file = null) {
    // Try to open a DM channel with the user
    const dmChannel = await this.getDMChannel();
    if (! dmChannel) {
      throw new Error('Could not open DMs with the user. They may have blocked the bot or set their privacy settings higher.');
    }

    // Send the DM
    const chunks = utils.chunk(text, 2000);
    const messages = await Promise.all(chunks.map((chunk, i) => {
      return dmChannel.createMessage(
        chunk,
        (i === chunks.length - 1 ? file : undefined)  // Only send the file with the last message
      );
    }));
    return messages[0];
  }

  /**
   * @returns {Promise<Eris~Message>}
   */
  async postToThreadChannel(...args) {
    try {
      if (typeof args[0] === 'string') {
        const chunks = utils.chunk(args[0], 2000);
        const messages = await Promise.all(chunks.map((chunk, i) => {
          const rest = (i === chunks.length - 1 ? args.slice(1) : []); // Only send the rest of the args (files, embeds) with the last message
          return bot.createMessage(this.channel_id, chunk, ...rest);
        }));
        return messages[0];
      } else {
        return bot.createMessage(this.channel_id, ...args);
      }
    } catch (e) {
      // Channel not found
      if (e.code === 10003) {
        console.log(`[INFO] Failed to send message to thread channel for ${this.user_name} because the channel no longer exists. Auto-closing the thread.`);
        this.close(true);
      } else {
        throw e;
      }
    }
  }

  /**
   * @param {String} text
   * @param {*} args
   * @returns {Promise<void>}
   */
  async postSystemMessage(text, ...args) {
    const msg = await this.postToThreadChannel(text, ...args);
    if (!msg) return;
    await this.addThreadMessageToDB({
      message_type: THREAD_MESSAGE_TYPE.SYSTEM,
      user_id: null,
      user_name: '',
      body: typeof text === 'string' ? text : text.content,
      is_anonymous: 0,
      dm_message_id: msg.id
    });
  }

  /**
   * @param {*} args
   * @returns {Promise<void>}
   */
  async postNonLogMessage(...args) {
    await this.postToThreadChannel(...args);
  }

  /**
   * @param {Eris.Message} msg
   * @returns {Promise<void>}
   */
  async saveChatMessage(msg) {
    return this.addThreadMessageToDB({
      message_type: THREAD_MESSAGE_TYPE.CHAT,
      user_id: msg.author.id,
      user_name: `${msg.author.username}#${msg.author.discriminator}`,
      body: msg.content,
      is_anonymous: 0,
      dm_message_id: msg.id
    });
  }

  async saveCommandMessage(msg) {
    return this.addThreadMessageToDB({
      message_type: THREAD_MESSAGE_TYPE.COMMAND,
      user_id: msg.author.id,
      user_name: `${msg.author.username}#${msg.author.discriminator}`,
      body: msg.content,
      is_anonymous: 0,
      dm_message_id: msg.id
    });
  }

  /**
   * @param {Eris.Message} msg
   * @returns {Promise<void>}
   */
  async updateChatMessage(msg) {
    await knex('thread_messages')
      .where('thread_id', this.id)
      .where('dm_message_id', msg.id)
      .update({
        body: msg.content
      });
  }

  /**
   * @param {String} messageId
   * @returns {Promise<void>}
   */
  async deleteChatMessage(messageId) {
    await knex('thread_messages')
      .where('thread_id', this.id)
      .where('dm_message_id', messageId)
      .delete();
  }

  /**
   * @param {Object} data
   * @returns {Promise<void>}
   */
  async addThreadMessageToDB(data) {
    await knex('thread_messages').insert({
      thread_id: this.id,
      created_at: moment.utc().format('YYYY-MM-DD HH:mm:ss'),
      is_anonymous: 0,
      ...data
    });
  }

  /**
   * @returns {Promise<ThreadMessage[]>}
   */
  async getThreadMessages() {
    const threadMessages = await knex('thread_messages')
      .where('thread_id', this.id)
      .orderBy('created_at', 'ASC')
      .orderBy('id', 'ASC')
      .select();

    return threadMessages.map(row => new ThreadMessage(row));
  }

  /**
   * @returns {Promise<void>}
   */
  async close(suppressSystemMessage = false, silent = false) {
    if (! suppressSystemMessage) {
      console.log(`Closing thread ${this.id}`);

      if (silent) {
        await this.postSystemMessage('Closing thread silently...');
      } else {
        await this.postSystemMessage('Closing thread...');
      }
    }

    // Update DB status
    await knex('threads')
      .where('id', this.id)
      .update({
        status: THREAD_STATUS.CLOSED
      });

    // Delete channel
    const channel = bot.getChannel(this.channel_id);
    if (channel) {
      console.log(`Deleting channel ${this.channel_id}`);
      await channel.delete('Thread closed');
    }
  }

  /**
   * @param {String} time
   * @param {Eris~User} user
   * @param {Number} silent
   * @returns {Promise<void>}
   */
  async scheduleClose(time, user, silent) {
    await knex('threads')
      .where('id', this.id)
      .update({
        scheduled_close_at: time,
        scheduled_close_id: user.id,
        scheduled_close_name: user.username,
        scheduled_close_silent: silent
      });
  }

  /**
   * @returns {Promise<void>}
   */
  async cancelScheduledClose() {
    await knex('threads')
      .where('id', this.id)
      .update({
        scheduled_close_at: null,
        scheduled_close_id: null,
        scheduled_close_name: null,
        scheduled_close_silent: null
      });
  }

  /**
   * @returns {Promise<void>}
   */
  async suspend() {
    await knex('threads')
      .where('id', this.id)
      .update({
        status: THREAD_STATUS.SUSPENDED,
        scheduled_suspend_at: null,
        scheduled_suspend_id: null,
        scheduled_suspend_name: null
      });
  }

  /**
   * @returns {Promise<void>}
   */
  async unsuspend() {
    await knex('threads')
      .where('id', this.id)
      .update({
        status: THREAD_STATUS.OPEN
      });
  }

  /**
   * @param {String} time
   * @param {Eris~User} user
   * @returns {Promise<void>}
   */
  async scheduleSuspend(time, user) {
    await knex('threads')
      .where('id', this.id)
      .update({
        scheduled_suspend_at: time,
        scheduled_suspend_id: user.id,
        scheduled_suspend_name: user.username
      });
  }

  /**
   * @returns {Promise<void>}
   */
  async cancelScheduledSuspend() {
    await knex('threads')
      .where('id', this.id)
      .update({
        scheduled_suspend_at: null,
        scheduled_suspend_id: null,
        scheduled_suspend_name: null
      });
  }

  /**
   * @param {String} userId
   * @returns {Promise<void>}
   */
  async setAlert(userId) {
    await knex('threads')
      .where('id', this.id)
      .update({
        alert_id: userId
      });
  }

  async toggleSub(userId, timeout) {
    if (this.sub_id) {
      if (this.sub_id != userId) {
        return `Someone else is already subscribed to this thread. For the time being, only a single user can have this enabled at once.`;
      } else {
        await knex('threads')
          .where('id', this.id)
          .update({
            sub_id: null,
            sub_last: null,
            sub_timeout: null
          });
        return `You will no longer be pinged each time this user sends a message.`;
      }
    } else {
      if (timeout) {
        if (timeout < 0 || timeout > 1440) {
          return `Timeouts are limited to between 1 and 1440 minutes (one day).`;
        }
        const now = moment.utc().format('YYYY-MM-DD HH:mm:ss');
        await knex('threads')
          .where('id', this.id)
          .update({
            sub_id: userId,
            sub_timeout: timeout,
            sub_last: now
          });
        return `You will now be pinged each time the user replies here, at most every **${timeout}** minutes.`;
      } else {
        await knex('threads')
          .where('id', this.id)
          .update({
            sub_id: userId
          });
        return `You will now be pinged each time the user replies here.`;
      }
    }
  }
  /**
   * @returns {Promise<void>}
   */
  async apologise() {
    try {
      await this.postToUser(config.apologyMessage);
      await this.postSystemMessage(`⌚ Sent user a long wait apology message.`);
    } catch (err) {
      await this.postSystemMessage(`**NOTE:** Could not send auto-response to the user. The error given was: \`${err.message}\``);
    }

    await knex('threads')
      .where('id', this.id)
      .update({
        apology_sent_at: moment.utc().format('YYYY-MM-DD HH:mm:ss')
      });
  }

  /**
   * @returns {Promise<Boolean>}
   */
  async toggleAutoreply(user_id) {
    // this update will reflect at an unknown future time, so store its value now
    const currentUsers = JSON.parse(this.autoreply);
    let result;
    if (user_id in currentUsers) {
      delete currentUsers[user_id];
      result = false;
    } else {
      currentUsers[user_id] = true;
      result = true;
    }
    await knex('threads')
    .where('id', this.id)
    .update({
      autoreply: JSON.stringify(currentUsers)
    });
    return result;
  }

  /**
   * @returns {Promise<String>}
   */
  getLogUrl() {
    return utils.getSelfUrl(`logs/${this.id}`);
  }
}

module.exports = Thread;
