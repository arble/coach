module.exports = ({ bot, knex, config, commands }) => {
  commands.addInboxThreadCommand('auto', [], async (msg, args, thread) => {
    const newState = await thread.toggleAutoreply();
    if (newState) {
      await thread.postSystemMessage(`Thread auto-reply mode **ENABLED**. All messages you send here will be relayed directly (except commands).`);
    } else {
      await thread.postSystemMessage(`Thread auto-reply mode **DISABLED**. Only explicit reply commands will send messages to the user.`);
    }
  });
};
