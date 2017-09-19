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

    let tags = await N.models.blogs.BlogTag.find()
                         .where('hid').in(Array.from(tagset.values()))
                         .limit(20)
                         .lean(true);

    env.res.tags = _.keyBy(tags.concat(env.data.categories).map(tag => _.pick(tag, [
      '_id', 'hid', 'user', 'name', 'is_category'
    ])), 'hid');
  });
};
