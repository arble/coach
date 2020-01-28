
exports.up = async function(knex, Promise) {
  await knex.schema.table('threads', table => {
    table.dateTime('apology_sent_at').index().nullable().defaultTo(null).after('gather_request');
  });
};

exports.down = async function(knex, Promise) {
  table.dropColumn('apology_sent_at');
};
