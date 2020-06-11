exports.up = async function (knex, Promise) {
  await knex.schema.table('threads', table => {
    table.string('thread_role').nullable().after('gather_replay');
  });
};

exports.down = async function(knex, Promise) {
  await knex.schema.table('threads', table => {
    table.dropColumn('thread_role');
  });
};
