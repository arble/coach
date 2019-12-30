module.exports = ({ bot, knex, config, commands }) => {
  commands.addInboxThreadCommand('auto', [], async (msg, args, thread) => {
    const newState = await thread.toggleAutoreply();
    if (newState) {
<<<<<<< HEAD
      await thread.postSystemMessage(`Thread auto-reply mode ENABLED. All messages you send here will be relayed directly, except commands.`);
    } else {
      await thread.postSystemMessage(`Thread auto-reply mode DISABLED. Only explicit reply commands will send messages to the user.`);
=======
<<<<<<< HEAD
      await thread.postSystemMessage(`Thread auto-reply mode ENABLED. All messages you send here will be relayed directly, except commands.`);
    } else {
      await thread.postSystemMessage(`Thread auto-reply mode DISABLED. Only explicit reply commands will send messages to the user.`);
=======
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
>>>>>>> 11393f9a26de5eb05e9e94eb0c60f0f13daff40b
>>>>>>> 1f6005ebcb08aba0ce7c5bdf37824c4890962c37
    }
  });
};
