exports.up = async function (knex, Promise) {
  await knex.schema.table('threads', table => {
    table.string('gather_replay').nullable().after('sub_timeout');
  });
};

exports.down = async function(knex, Promise) {
  await knex.schema.table('threads', table => {
    table.dropColumn('gather_replay');
  });
};
