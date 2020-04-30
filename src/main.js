const Eris = require('eris');
const path = require('path');

const config = require('./config');
const bot = require('./bot');
const knex = require('./knex');
const {messageQueue} = require('./queue');
const utils = require('./utils');
const { createCommandManager } = require('./commands');
const { getPluginAPI, loadPlugin } = require('./plugins');

const blocked = require('./data/blocked');
const threads = require('./data/threads');
const updates = require('./data/updates');

const reply = require('./modules/reply');
const close = require('./modules/close');
const snippets = require('./modules/snippets');
const logs = require('./modules/logs');
const move = require('./modules/move');
const block = require('./modules/block');
const suspend = require('./modules/suspend');
const webserver = require('./modules/webserver');
const greeting = require('./modules/greeting');
const typingProxy = require('./modules/typingProxy');
const version = require('./modules/version');
const newthread = require('./modules/newthread');
const idModule = require('./modules/id');
const alert = require('./modules/alert');
const auto = require('./modules/auto');
const claim = require('./modules/claim');
const sub = require('./modules/sub');

const {ACCIDENTAL_THREAD_MESSAGES, THREAD_MESSAGE_TYPE, THREAD_STATUS, THREAD_GATHER_INFO} = require('./data/constants');

module.exports = {
  async start() {
    console.log('Connecting to Discord...');

    bot.once('ready', async () => {
      console.log('Connected! Waiting for guilds to become available...');
      await Promise.all([
        ...config.mainGuildId.map(id => waitForGuild(id)),
        waitForGuild(config.mailGuildId)
      ]);

      console.log('Initializing...');
      initStatus();
      initBaseMessageHandlers();
      initPlugins();

      console.log('');
      console.log('Done! Now listening to DMs.');
      console.log('');
    });

    bot.connect();
  }
};

function waitForGuild(guildId) {
  if (bot.guilds.has(guildId)) {
    return Promise.resolve();
  }

  return new Promise(resolve => {
    bot.on('guildAvailable', guild => {
      if (guild.id === guildId) {
        resolve();
      }
    });
  });
}

function initStatus() {
  function applyStatus() {
    bot.editStatus(null, {name: config.status});
  }

  // Set the bot status initially, then reapply it every hour since in some cases it gets unset
  applyStatus();
  setInterval(applyStatus, 60 * 60 * 1000);
}

function initBaseMessageHandlers() {
  /**
   * When a moderator posts in a coachmail thread...
   * 1) If alwaysReply is enabled, reply to the user
   * 2) If alwaysReply is disabled, save that message as a chat message in the thread
   */
  bot.on('messageCreate', async msg => {
    if (! utils.messageIsOnInboxServer(msg)) return;
    if (msg.author.bot) return;

    const thread = await threads.findByChannelId(msg.channel.id);
    if (! thread) return;

    if (msg.content.startsWith(config.prefix) || msg.content.startsWith(config.snippetPrefix)) {
      // Save commands as "command messages"
      if (msg.content.startsWith(config.snippetPrefix)) return; // Ignore snippets
      thread.saveCommandMessage(msg);
    } else if (config.alwaysReply || (thread.autoreply && msg.author.id in JSON.parse(thread.autoreply))) {
      // AUTO-REPLY: If config.alwaysReply is enabled, send all chat messages in thread channels as replies
      if (! utils.isStaff(msg.member)) return; // Only staff are allowed to reply

      const replied = await thread.replyToUser(msg.member, msg.content.trim(), msg.attachments, config.alwaysReplyAnon || false);
      if (replied) msg.delete();
    } else {
      // Otherwise just save the messages as "chat" in the logs
      thread.saveChatMessage(msg);
    }
  });

  /**
   * When we get a private message...
   * 1) Find the open coachmail thread for this user, or create a new one
   * 2) Post the message as a user reply in the thread
   */
  bot.on('messageCreate', async msg => {
    if (! (msg.channel instanceof Eris.PrivateChannel)) return;
    if (msg.author.bot) return;
    if (msg.type !== 0) return; // Ignore pins etc.

    if (await blocked.isBlocked(msg.author.id)) return;

    let created = false;

    // Private message handling is queued so e.g. multiple message in quick succession don't result in multiple channels being created
    messageQueue.add(async () => {
      let thread = await threads.findOpenThreadByUserId(msg.author.id);

      // New thread
      if (! thread) {
        // Ignore messages that shouldn't usually open new threads, such as "ok", "thanks", etc.
        if (config.ignoreAccidentalThreads && msg.content && ACCIDENTAL_THREAD_MESSAGES.includes(msg.content.trim().toLowerCase())) return;

        thread = await threads.createNewThreadForUser(msg.author);
        created = true;
      }

      // if we just created the thread, DON'T process the first message, since we ask a set number of questions
      if (thread && !created) await thread.receiveUserReply(msg);
    });
  });

  bot.on('guildMemberRemove', async (guild, member) => {
    if (!config.mainGuildId.includes(guild.id)) return;
    const thread = await threads.findOpenThreadByUserId(member.id);
    if (thread) {
      thread.postSystemMessage('⚠️ User **left** the server.');
    }
  });

  bot.on('guildMemberAdd', async (guild, member) => {
    if (!config.mainGuildId.includes(guild.id)) return;
    const thread = await threads.findOpenThreadByUserId(member.id);
    if (thread) {
      thread.postSystemMessage('⚠️ User **rejoined** the server.');
    }
  });

  /**
   * When a message is edited...
   * 1) If that message was in DMs, and we have a thread open with that user, post the edit as a system message in the thread
   * 2) If that message was moderator chatter in the thread, update the corresponding chat message in the DB
   */
  bot.on('messageUpdate', async (msg, oldMessage) => {
    if (! msg || ! msg.author) return;
    if (msg.author.bot) return;
    if (await blocked.isBlocked(msg.author.id)) return;

    // Old message content doesn't persist between bot restarts
    const oldContent = oldMessage && oldMessage.content || '*Unavailable due to bot restart*';
    const newContent = msg.content;

    // Ignore bogus edit events with no changes
    if (newContent.trim() === oldContent.trim()) return;

    // 1) Edit in DMs
    if (msg.channel instanceof Eris.PrivateChannel) {
      const thread = await threads.findOpenThreadByUserId(msg.author.id);
      if (! thread) return;

      const editMessage = utils.disableLinkPreviews(`**The user edited their message:**\n\`B:\` ${oldContent}\n\`A:\` ${newContent}`);
      thread.postSystemMessage(editMessage);
    }

    // 2) Edit in the thread
    else if (utils.messageIsOnInboxServer(msg) && utils.isStaff(msg.member)) {
      const thread = await threads.findOpenThreadByChannelId(msg.channel.id);
      if (! thread) return;

      thread.updateChatMessage(msg);
    }
  });

  /**
   * When a staff message is deleted in a coachmail thread, delete it from the database as well
   */
  bot.on('messageDelete', async msg => {
    if (! msg.author) return;
    if (msg.author.bot) return;
    if (! utils.messageIsOnInboxServer(msg)) return;
    if (! utils.isStaff(msg.member)) return;

    const thread = await threads.findOpenThreadByChannelId(msg.channel.id);
    if (! thread) return;

    thread.deleteChatMessage(msg.id);
  });

  bot.on('messageReactionAdd', async (msg, emoji, userId) => {
    if (!(msg.channel instanceof Eris.PrivateChannel)) return;
    if (userId === bot.user.id) return;
    let thread = await threads.findOpenThreadByUserId(userId);
    if (!thread) return;
    if (thread.gather_state === THREAD_GATHER_INFO.COMPLETE) return;

    if (thread.gather_platform === msg.id) {
      if (thread.gather_state < THREAD_GATHER_INFO.COMPLETE && emoji.name === '❌') {
        await messageQueue.add(async () => {
          thread.postToUser(config.gatherCancelmessage);
          await thread.close(true);
        });
        const logUrl = await thread.getLogUrl();
        utils.postLog(utils.trimAll(`
          Coach thread with ${thread.user_name} (${thread.user_id}) was cancelled by the user before supplying survey info.
          Logs: ${logUrl}
        `));
        return;
      }
      if (thread.gather_state === THREAD_GATHER_INFO.PLATFORM && config.platformChoiceReactions.includes(emoji)) {
        const reply = await thread.postToUser(config.gatherRankMessage);
        await knex('threads')
        .where('id', thread.id)
        .update({
          gather_rank: reply.id,
          gather_state: THREAD_GATHER_INFO.RANK
        });
        for (rankEmoji of config.rankChoiceReactions) {
          await bot.addMessageReaction(reply.channel.id, reply.id, rankEmoji);
        }
      }
    }

    if (thread.gather_rank === msg.id && thread.gather_state === THREAD_GATHER_INFO.RANK && config.rankChoiceReactions.includes(emoji)) {
      const reply = await thread.postToUser(config.gatherChoiceMessage);
      await knex('threads')
      .where('id', thread.id)
      .update({
        gather_choice: reply.id,
        gather_state: THREAD_GATHER_INFO.CHOICE
      });
      for (roleEmoji of config.roleChoiceReactions) {
        await bot.addMessageReaction(reply.channel.id, reply.id, roleEmoji);
      }
    }

    if (thread.gather_choice === msg.id && thread.gather_state === THREAD_GATHER_INFO.CHOICE && config.roleChoiceReactions.includes(emoji)) {
      const reply = await thread.postToUser(config.gatherRequestMessage);
      await knex('threads')
      .where('id', thread.id)
      .update({
        gather_state: THREAD_GATHER_INFO.REQUEST
      });
    }

    if (thread.gather_state === THREAD_GATHER_INFO.INCOMPLETE && emoji.name === '✅') {
      thread.finishSurvey(null);
    }
  });
}



function initPlugins() {
  // Initialize command manager
  const commands = createCommandManager(bot);

  // Register command aliases
  if (config.commandAliases) {
    for (const alias in config.commandAliases) {
      commands.addAlias(config.commandAliases[alias], alias);
    }
  }

  // Load plugins
  console.log('Loading plugins');
  const builtInPlugins = [
    reply,
    close,
    logs,
    block,
    move,
    snippets,
    suspend,
    greeting,
    webserver,
    typingProxy,
    version,
    newthread,
    idModule,
    alert,
    auto,
    claim,
    sub
  ];

  const plugins = [...builtInPlugins];

  if (config.plugins && config.plugins.length) {
    for (const plugin of config.plugins) {
      const pluginFn = require(`../${plugin}`);
      plugins.push(pluginFn);
    }
  }

  const pluginApi = getPluginAPI({ bot, knex, config, commands });
  plugins.forEach(pluginFn => loadPlugin(pluginFn, pluginApi));

  console.log(`Loaded ${plugins.length} plugins (${builtInPlugins.length} built-in plugins, ${plugins.length - builtInPlugins.length} external plugins)`);

  if (config.updateNotifications) {
    updates.startVersionRefreshLoop();
  }
}
