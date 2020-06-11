const utils = require("../utils");

module.exports = ({ bot, knex, config, commands }) => {
  commands.addInboxThreadCommand('threadcounts', [], async (msg, args, thread) => {
    const roles = await utils.getThreadRoles();
    thread.postSystemMessage(roles.toString());
  });
};
