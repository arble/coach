const threads = require("../threads");

module.exports = ({ bot, knex, config, commands }) => {
  commands.addInboxThreadCommand('threadcounts', [], async (msg, args, thread) => {
    const roles = await threads.getThreadRoles();
    thread.postSystemMessage(roles.toString());
  });
};
