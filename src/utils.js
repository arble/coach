const Eris = require('eris');
const bot = require('./bot');
const moment = require('moment');
const humanizeDuration = require('humanize-duration');
const publicIp = require('public-ip');
const config = require('./config');

class BotError extends Error {}

const userMentionRegex = /^<@!?([0-9]+?)>$/;

let inboxGuild = null;
let mainGuilds = [];
let logChannel = null;

/**
 * @returns {Eris~Guild}
 */
function getInboxGuild() {
  if (! inboxGuild) inboxGuild = bot.guilds.find(g => g.id === config.mailGuildId);
  if (! inboxGuild) throw new BotError('The bot is not on the coachmail (inbox) server!');
  return inboxGuild;
}

/**
 * @returns {Eris~Guild[]}
 */
function getMainGuilds() {
  if (mainGuilds.length === 0) {
    mainGuilds = bot.guilds.filter(g => config.mainGuildId.includes(g.id));
  }

  if (mainGuilds.length !== config.mainGuildId.length) {
    if (config.mainGuildId.length === 1) {
      console.warn(`[WARN] The bot hasn't joined the main guild!`);
    } else {
      console.warn(`[WARN] The bot hasn't joined one or more main guilds!`);
    }
  }

  return mainGuilds;
}

/**
 * Returns the designated log channel, or the default channel if none is set
 * @returns {Eris~TextChannel}
 */
function getLogChannel() {
  const inboxGuild = getInboxGuild();

  if (! config.logChannelId) {
    logChannel = inboxGuild.channels.get(inboxGuild.id);
  } else if (! logChannel) {
    logChannel = inboxGuild.channels.get(config.logChannelId);
  }

  if (! logChannel) {
    throw new BotError('Log channel not found!');
  }

  return logChannel;
}

function postLog(...args) {
  getLogChannel().createMessage(...args);
}

function postError(channel, str, opts = {}) {
  return channel.createMessage({
    ...opts,
    content: `⚠ ${str}`
  });
}

/**
 * Returns whether the given member has permission to use coachmail commands
 * @param member
 * @returns {boolean}
 */
function isStaff(member) {
  if (! member) return false;
  if (config.inboxServerPermission.length === 0) return true;

  return config.inboxServerPermission.some(perm => {
    if (isSnowflake(perm)) {
      // If perm is a snowflake, check it against the member's user id and roles
      if (member.id === perm) return true;
      if (member.roles.includes(perm)) return true;
    } else {
      // Otherwise assume perm is the name of a permission
      return member.permission.has(perm);
    }

    return false;
  });
}

/**
 * Returns whether the given message is on the inbox server
 * @param msg
 * @returns {boolean}
 */
function messageIsOnInboxServer(msg) {
  if (! msg.channel.guild) return false;
  if (msg.channel.guild.id !== getInboxGuild().id) return false;
  return true;
}

/**
 * Returns whether the given message is on the main server
 * @param msg
 * @returns {boolean}
 */
function messageIsOnMainServer(msg) {
  if (! msg.channel.guild) return false;

  return getMainGuilds()
    .some(g => msg.channel.guild.id === g.id);
}

/**
 * @param attachment
 * @returns {Promise<string>}
 */
async function formatAttachment(attachment, attachmentUrl) {
  let filesize = attachment.size || 0;
  filesize /= 1024;

  return `**Attachment:** ${attachment.filename} (${filesize.toFixed(1)}KB)\n${attachmentUrl}`;
}

/**
 * Returns the user ID of the user mentioned in str, if any
 * @param {String} str
 * @returns {String|null}
 */
function getUserMention(str) {
  if (! str) return null;

  str = str.trim();

  if (isSnowflake(str)) {
    // User ID
    return str;
  } else {
    let mentionMatch = str.match(userMentionRegex);
    if (mentionMatch) return mentionMatch[1];
  }

  return null;
}

/**
 * Returns the current timestamp in an easily readable form
 * @returns {String}
 */
function getTimestamp(...momentArgs) {
  return moment.utc(...momentArgs).format('HH:mm');
}

/**
 * Disables link previews in the given string by wrapping links in < >
 * @param {String} str
 * @returns {String}
 */
function disableLinkPreviews(str) {
  return str.replace(/(^|[^<])(https?:\/\/\S+)/ig, '$1<$2>');
}

/**
 * Returns a URL to the bot's web server
 * @param {String} path
 * @returns {Promise<String>}
 */
async function getSelfUrl(path = '') {
  if (config.url) {
    return `${config.url}/${path}`;
  } else {
    const port = config.port || 8890;
    const ip = await publicIp.v4();
    return `http://${ip}:${port}/${path}`;
  }
}

/**
 * Returns the highest hoisted role of the given member
 * @param {Eris~Member} member
 * @returns {Eris~Role}
 */
function getMainRole(member) {
  const roles = member.roles.map(id => member.guild.roles.get(id));
  roles.sort((a, b) => a.position > b.position ? -1 : 1);
  return roles.find(r => r.hoist);
}

/**
 * Splits array items into chunks of the specified size
 * @param {Array|String} items
 * @param {Number} chunkSize
 * @returns {Array}
 */
function chunk(items, chunkSize) {
  const result = [];

  for (let i = 0; i < items.length; i += chunkSize) {
    result.push(items.slice(i, i + chunkSize));
  }

  return result;
}

/**
 * Trims every line in the string
 * @param {String} str
 * @returns {String}
 */
function trimAll(str) {
  return str
    .split('\n')
    .map(str => str.trim())
    .join('\n');
}

const delayStringRegex = /^([0-9]+)(?:([dhms])[a-z]*)?/i;

/**
 * Turns a "delay string" such as "1h30m" to milliseconds
 * @param {String} str
 * @returns {Number|null}
 */
function convertDelayStringToMS(str) {
  let match;
  let ms = 0;

  str = str.trim();

  while (str !== '' && (match = str.match(delayStringRegex)) !== null) {
    if (match[2] === 'd') ms += match[1] * 1000 * 60 * 60 * 24;
    else if (match[2] === 'h') ms += match[1] * 1000 * 60 * 60;
    else if (match[2] === 's') ms += match[1] * 1000;
    else if (match[2] === 'm' || ! match[2]) ms += match[1] * 1000 * 60;

    str = str.slice(match[0].length);
  }

  // Invalid delay string
  if (str !== '') {
    return null;
  }

  return ms;
}

function getInboxMention(role) {
  if (!config.mentionRole) {
    return '@here ';
  }
  switch (role) {
    case 'Support':
      return `<@&${config.mentionRole.support}> `;
    case 'Damage':
      return `<@&${config.mentionRole.damage}> `;
    case 'Tank':
      return `<@&${config.mentionRole.tank}> `;
    default:
      return '@here ';
  }
}

async function clearOtherUserReactions(message, emoji, userId) {
  for (let reaction in message.reactions) {
    if (reaction === emoji) continue;
    val = message.reactions[reaction];
    if (val.count > 1) {
      await bot.removeMessageReaction(message.channel.id, message.id, reaction, userId);
    }
  }
}

async function checkRoleCapacity(emoji) {
  let category, limit;
  if (emoji == "Damage") {
    category = config.categoryAutomation.damageThread;
    limit = config.categoryAutomation.damageLimit;
  } else if (emoji == "Tank") {
    category = config.categoryAutomation.tankThread;
    limit = config.categoryAutomation.tankLimit;
  } else if (emoji == "Support") {
    category = config.categoryAutomation.supportThread;
    limit = config.categoryAutomation.supportLimit;
  } else {
    return false;
  }

  const foundCategory = bot.getChannel(category);

  if (!foundCategory) return false;

  return foundCategory.channels.size < limit;
}

async function getUserReactionChoice(chanId, msgId) {
  const msg = await bot.getMessage(chanId, msgId);
  for (let rct in msg.reactions) {
    val = msg.reactions[rct];
    if (val.count > 1) {
      return (rct.split(':'))[0];
    }
  }
  return null;
}

function postSystemMessageWithFallback(channel, thread, text) {
  if (thread) {
    thread.postSystemMessage(text);
  } else {
    channel.createMessage(text);
  }
}

/**
 * A normalized way to set props in data models, fixing some inconsistencies between different DB drivers in knex
 * @param {Object} target
 * @param {Object} props
 */
function setDataModelProps(target, props) {
  for (const prop in props) {
    if (! props.hasOwnProperty(prop)) continue;
    // DATETIME fields are always returned as Date objects in MySQL/MariaDB
    if (props[prop] instanceof Date) {
      // ...even when NULL, in which case the date's set to unix epoch
      if (props[prop].getUTCFullYear() === 1970) {
        target[prop] = null;
      } else {
        // Set the value as a string in the same format it's returned in SQLite
        target[prop] = moment.utc(props[prop]).format('YYYY-MM-DD HH:mm:ss');
      }
    } else {
      target[prop] = props[prop];
    }
  }
}

const snowflakeRegex = /^[0-9]{17,}$/;
function isSnowflake(str) {
  return str && snowflakeRegex.test(str);
}

const humanizeDelay = (delay, opts = {}) => humanizeDuration(delay, Object.assign({conjunction: ' and '}, opts));

const markdownCharsRegex = /([\\_*|`~])/g;
function escapeMarkdown(str) {
  return str.replace(markdownCharsRegex, '\\$1');
}

function disableCodeBlocks(str) {
  return str.replace(/`/g, "`\u200b");
}

function equalsIC(str, other) {
  return str.localeCompare(other, undefined, {sensitivity: 'base'}) === 0;
}

function roleToCategory(role) {
  switch (role) {
    case 'Support':
      return config.categoryAutomation.supportThread;
    case 'Damage':
      return config.categoryAutomation.damageThread;
    case 'Tank':
      return config.categoryAutomation.tankThread;
    default:
      return config.categoryAutomation.waitingThread;
  }
}

async function getOpenRoles(boolOnly) {
  /*
  * Our check is somewhat cheaty. Get the current time, move it by the appropriate
  * mulitple of 8 hours, and check whether our ISO day of week is 6 or 7. If it isn't,
  * we're not in coaching hours. Offset by -3 to try to put the opening time in the most
  * useful time range for each continent.
  */

  const now = moment();
  now.add(((now.week() % 3) - 1) * 8, 'hours');
  if (now.isoWeekday() < 6) return null;
  if (now.isoWeekday() == 5 && now.hour() < 21) return null;
/*
  const now = moment.utc();
  const offset = ((now.week() % 3) - 1) * 480;
  const thisWeekStart = moment().startOf('isoWeek').add(5, 'days').utcOffset(offset);
  const thisWeekEnd = moment().startOf('isoWeek').add(7, 'days').utcOffset(offset);
  if (!now.isBetween(thisWeekStart, thisWeekEnd)) {
    return null;
  }
  */
  if (boolOnly) {
    return await checkRoleCapacity('Damage') || await checkRoleCapacity ('Support') || await checkRoleCapacity('Tank');
  } else {
    return {
      Damage: await checkRoleCapacity('Damage'),
      Support: await checkRoleCapacity('Support'),
      Tank: await checkRoleCapacity('Tank')
    };
  }
}

function nextCoachingOpen(duration) {
  const now = moment();
  const offset = (now.week() % 3) * 8;
  const target = moment().startOf('isoWeek').add(5, 'days').add(21 - offset, 'hours');
  if (now.isAfter(target)) {
    // get next week's
    const nextOffset = ((now.isoWeek() + 1) % 3) * 8;
    const nextTarget = target.startOf('day').add(1, 'week').add(21 - nextOffset, 'hours');
    if (duration) {
      return moment.duration(nextTarget.diff(now));
    } else {
      return nextTarget;
    }
  } else {
    if (duration) {
      return moment.duration(target.diff(now));
    } else {
      return target;
    }
  }


}

module.exports = {
  BotError,

  getInboxGuild,
  getMainGuilds,
  getLogChannel,
  postError,
  postLog,

  isStaff,
  messageIsOnInboxServer,
  messageIsOnMainServer,

  formatAttachment,

  getUserMention,
  getTimestamp,
  disableLinkPreviews,
  getSelfUrl,
  getMainRole,
  delayStringRegex,
  convertDelayStringToMS,
  getInboxMention,
  postSystemMessageWithFallback,

  chunk,
  trimAll,

  setDataModelProps,

  isSnowflake,

  humanizeDelay,

  escapeMarkdown,
  disableCodeBlocks,
  equalsIC,
  roleToCategory,
  clearOtherUserReactions,
  getUserReactionChoice,
  checkRoleCapacity,
  getOpenRoles,
  nextCoachingOpen
};
