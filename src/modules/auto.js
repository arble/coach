module.exports = ({ bot, knex, config, commands }) => {
  commands.addInboxThreadCommand('auto', [], async (msg, args, thread) => {
    const newState = await thread.toggleAutoreply(msg.author.id);
    const user = `**${msg.author.username}#${msg.author.discriminator}`;
    if (newState) {
      await thread.postSystemMessage(`Thread auto-reply mode **ENABLED** for ${user}. All messages you send here will be relayed directly (except commands).`);
    } else {
      await thread.postSystemMessage(`Thread auto-reply mode **DISABLED** for ${user}. Only explicit reply commands will send messages to the user.`);
    }
  });
};
