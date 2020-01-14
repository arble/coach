
exports.up = async function(knex, Promise) {
  await knex.schema.table('threads', table => {
    table.json('autoreply_users').after('gather_request');
  });
};

exports.down = async function(knex, Promise) {
  table.dropColumn('autoreply_users');
};
