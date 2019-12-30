module.exports = ({ bot, knex, config, commands }) => {
  commands.addInboxThreadCommand('auto', [], async (msg, args, thread) => {
    const newState = await thread.toggleAutoreply();
    if (newState) {
      await thread.postSystemMessage(`Thread auto-reply mode ENABLED. All messages you send here will be relayed directly, except commands`);
    } else {
      await thread.postSystemMessage(`Thread auto-reply mode DISABLED. `);
    }
    
    if (args.opt && args.opt.startsWith('c')) {
      await thread.setAlert(null);
      await thread.postSystemMessage(`Cancelled new message alert`);
    } else {
      await thread.setAlert(msg.author.id);
      await thread.postSystemMessage(`Pinging ${msg.author.username}#${msg.author.discriminator} when this thread gets a new reply`);
    }
  });
};
