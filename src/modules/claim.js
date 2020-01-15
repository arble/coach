const config = require('../config');
const Eris = require('eris');
const transliterate = require("transliteration");
const erisEndpoints = require('eris/lib/rest/Endpoints');

module.exports = ({ bot, knex, config, commands }) => {
  commands.addInboxThreadCommand('claim', [], async (msg, args, thread) => {
    const username = transliterate.slugify(`${msg.author.username}`);
    const catStr = `${username}#${msg.author.discriminator}`;

    // only allow claiming of threads that are still in "Waiting Threads"
    if (msg.channel.parentID !== config.categoryAutomation.waitingThread) return;

    console.log(JSON.stringify(msg.channel.guild.channels));
    const targetCategory = msg.channel.guild.channels.find(c => {
      return (c instanceof Eris.CategoryChannel) && (c.name === catStr);
    });
    console.log(JSON.stringify(msg.channel.guild.channels));

    if (targetCategory) {
      await bot.editChannel(thread.channel_id, {
        parentID: targetCategory.id
      });
    } else {
      const newCat = await msg.channel.guild.createChannel(catStr, 4);

      // might have need of this later
      //await bot.editChannelPermission(newCat.id, config.mailGuildId, null, 1024, 'role');
      //await bot.editChannelPermission(newCat.id, config.inboxServerPermission, 1024, null, 'role');
      await bot.editChannel(thread.channel_id, {
        parentID: newCat.id
      });
    }

    thread.postSystemMessage(`Thread claimed by **${msg.author.username}#${msg.author.discriminator}**`)
  });
};
