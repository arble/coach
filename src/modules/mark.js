module.exports = ({ bot, knex, config, commands }) => {
  commands.addInboxThreadCommand('mark', '<role:string$>', async (msg, args, thread) => {
    if (thread.thread_role) {
      await thread.postSystemMessage(`Thread already marked`);
      return;
    }

    switch (args.role.toLowerCase()) {
      case 'damage':
      case 'tank':
      case 'support':
        thread.setRole(args.role.toLowerCase());
        await thread.postSystemMessage(`Thread marked as **${args.role.toUpperCase()}**`);
        break;
      default:
        await thread.postSystemMessage(`That's not a valid role!`);
        break;
    }
  });
};
