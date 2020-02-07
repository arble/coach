exports.up = async function (knex, Promise) {
  await knex.schema.table('threads', table => {
    table.string('sub_id', 20).nullable().defaultTo(null).after('apology_sent_at');
    table.datetime('sub_last').nullable().defaultTo(null).after('sub_id');
    table.integer('sub_timeout').unsigned().nullable().defaultTo(null).after('sub_last');
  });
};

exports.down = async function(knex, Promise) {
  await knex.schema.table('threads', table => {
    table.dropColumn('sub_id');
    table.dropColumn('sub_last');
    table.dropColumn('sub_timeout');
  });
};
