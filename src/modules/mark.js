module.exports = ({ bot, knex, config, commands }) => {
  commands.addInboxThreadCommand('mark', '<role:string$>', async (msg, args, thread) => {
    if (thread.thread_role) {
      await thread.postSystemMessage(`Thread already marked`);
      return;
    }

    switch (args.role.toLowerCase()) {
      case 'damage':
        thread.setRole("Damage");
        await thread.postSystemMessage(`Thread marked as **Damage**`);
        break;
      case 'tank':
        thread.setRole("Tank");
        await thread.postSystemMessage(`Thread marked as **Tank**`);
        break;
      case 'support':
        thread.setRole("Support");
        await thread.postSystemMessage(`Thread marked as **Support**`);
        break;
      default:
        await thread.postSystemMessage(`That's not a valid role!`);
        break;
    }
  });
};
