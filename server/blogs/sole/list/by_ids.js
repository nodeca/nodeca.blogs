// Get blog entries by ids
//
// Same as blogs.index.list.by_range, except it fetches tags for each entry
//
'use strict';


const _       = require('lodash');


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


  // Fetch tags for all entries
  //
  N.wire.after(apiPath, async function fetch_tags(env) {
    let tagset = new Set();

    for (let entry of env.data.entries) {
      for (let hid of entry.tag_hids || []) {
        tagset.add(hid);
      }
    }

    let tags_by_name = _.keyBy(
      await N.models.blogs.BlogTag.find()
                .where('hid').in(Array.from(tagset.values()))
                .lean(true),
      'name_lc'
    );

    env.res.entry_tags = {};

    for (let entry of env.data.entries) {
      let tags = (entry.tags || [])
                   /* eslint-disable no-loop-func */
                   .map((name, idx) => {
                     let name_lc = N.models.blogs.BlogTag.normalize(name);
                     return [ name, tags_by_name[name_lc]?.is_category, idx ];
                   })
                   /* eslint-disable no-unused-vars */
                   .sort(([ t1, cat1, idx1 ], [ t2, cat2, idx2 ]) => {
                   /* eslint-enable no-unused-vars */
                     // move categories before all other tags
                     if (cat1 && !cat2) return -1;
                     if (cat2 && !cat1) return 1;
                     return idx1 - idx2;
                   })
                   .map(([ name, cat ]) => ({
                     name,
                     user: entry.user,
                     is_category: cat
                   }));

      env.res.entry_tags[entry._id] = tags;
    }
  });
};
