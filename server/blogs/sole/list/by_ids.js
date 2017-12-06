// Get blog entries by ids
//
// Same as blogs.index.list.by_range, except it fetches tags for each entry
//
'use strict';


const _       = require('lodash');
const Promise = require('bluebird');


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

    let tags_by_hid = _.keyBy(
      await N.models.blogs.BlogTag.find()
                .where('hid').in(Array.from(tagset.values()))
                .lean(true),
      'hid'
    );

    env.res.entry_tags = {};

    for (let entry of env.data.entries) {
      let tags = (entry.tag_hids || [])
                   .map((hid, idx) => [ tags_by_hid[hid], idx ])
                   .filter(([ tag ]) => !!tag)
                   .sort(([ t1, idx1 ], [ t2, idx2 ]) => {
                     // move categories before all other tags
                     if (t1.is_category && !t2.is_category) return -1;
                     if (t2.is_category && !t1.is_category) return 1;
                     return idx1 - idx2;
                   })
                   .map(([ tag ]) => _.pick(tag, [ 'user', 'name', 'is_category' ]));

      env.res.entry_tags[entry._id] = tags;
    }
  });
};
