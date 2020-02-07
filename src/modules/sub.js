module.exports = ({ bot, knex, config, commands }) => {
  commands.addInboxThreadCommand('sub', '[opt:string]', async (msg, args, thread) => {
    if (args.opt && !isNaN(args.opt)) {
       await thread.postSystemMessage(thread.toggleSub(msg.author.id, args.opt));
    } else {
      await thread.postSystemMessage(thread.toggleSub(msg.author.id, null));
    }
  });
};
