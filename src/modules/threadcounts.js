module.exports = ({ bot, knex, config, commands }) => {
  commands.addInboxThreadCommand('threadcounts', [], async (msg, args, thread) => {
    thread.postSystemMessage(threads.getThreadRoles());
  });
};
