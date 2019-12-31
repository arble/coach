
exports.up = async function(knex, Promise) {
  await knex.schema.table('threads', table => {
    table.integer('gather_state').defaultTo(1).after('autoreply');
    table.string('gather_platform').nullable().after('gather_state');
    table.string('gather_rank').nullable().after('gather_platform');
    table.string('gather_choice').nullable().after('gather_rank');
    table.string('gather_request').nullable().after('gather_choice');
  });
};

exports.down = async function(knex, Promise) {
  table.dropColumn('gather_request');
  table.dropColumn('gather_choice');
  table.dropColumn('gather_rank');
  table.dropColumn('gather_platform');
  table.dropColumn('gather_state');
};
