
exports.up = async function(knex, Promise) {
  await knex.schema.table('threads', table => {
    table.string('autoreply').after('scheduled_suspend_name');
  });
};

exports.down = async function(knex, Promise) {
  table.dropColumn('autoreply');
};
