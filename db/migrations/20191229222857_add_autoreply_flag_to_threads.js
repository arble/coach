
exports.up = function(knex, Promise) {
  await knex.schema.table('threads', table => {
    table.boolean('autoreply').defaultTo(false).after('scheduled_suspend_name');
  });
};

exports.down = function(knex, Promise) {
  table.dropColumn('autoreply');
};
