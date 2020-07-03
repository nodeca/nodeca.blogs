// Get blog entries by ids
//
'use strict';


// Max entries to fetch
const LIMIT = 100;


module.exports = function (N, apiPath) {

  N.validate(apiPath, {
    entry_ids: { type: 'array', required: true, uniqueItems: true, maxItems: LIMIT, items: { format: 'mongo' } }
  });


  function build_entry_ids(env) {
    env.data.entry_ids = env.params.entry_ids;
    return Promise.resolve();
  }


  // Fetch entry list subcall
  //
  N.wire.on(apiPath, function fetch_entry_list(env) {
    env.data.build_entry_ids = build_entry_ids;

    return N.wire.emit('internal:blogs.entry_list', env);
  });
};
