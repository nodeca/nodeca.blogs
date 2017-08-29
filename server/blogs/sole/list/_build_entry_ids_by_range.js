// Reflection helper for `internal:blogs.entry_list`:
//
// Builds IDs of blog entries to fetch for current page
//
// In:
//
// - env.data.user
// - env.data.current_tag
// - env.data.select_before
// - env.data.select_after
// - env.data.select_start
// - env.data.blog_entries_visible_statuses
//
// Out:
//
// - env.data.entry_ids
//
// Needed in:
//
// - `blogs/sole/list/by_range.js`
// - `blogs/sole/sole.js`
//
'use strict';

const _ = require('lodash');


module.exports = function (N) {

  async function select_visible_before(env) {
    if (env.data.select_before <= 0) return [];

    // first page, don't need to fetch anything
    if (!env.data.select_start) return [];

    let query = N.models.blogs.BlogEntry.find();

    if (env.data.current_tag) {
      query = query.where('tag_hids').equals(env.data.current_tag.hid);
    }

    let entries = await query
                          .where('user').equals(env.data.user._id)
                          .where('st').in(env.data.blog_entries_visible_statuses)
                          .where('_id').gt(env.data.select_start)
                          .sort('_id')
                          .select('_id')
                          .limit(env.data.select_before)
                          .lean(true);

    return _.map(entries, '_id').reverse();
  }


  async function select_visible_after(env) {
    let count = env.data.select_after;

    if (env.data.select_after <= 0) return [];

    let query = N.models.blogs.BlogEntry.find();

    if (env.data.select_start) {
      if (env.data.select_after > 0 && env.data.select_before > 0) {
        // if we're selecting both `after` and `before`, include current message
        // in the result, otherwise don't
        query = query.where('_id').lte(env.data.select_start);
        count++;
      } else {
        query = query.where('_id').lt(env.data.select_start);
      }
    }

    if (env.data.current_tag) {
      query = query.where('tag_hids').equals(env.data.current_tag.hid);
    }

    let entries = await query
                          .where('user').equals(env.data.user._id)
                          .where('st').in(env.data.blog_entries_visible_statuses)
                          .sort('-_id')
                          .select('_id')
                          .limit(count)
                          .lean(true);

    return _.map(entries, '_id');
  }


  return async function buildDialogsIds(env) {
    // Run both functions in parallel and concatenate results
    //
    let results = await Promise.all([ select_visible_before(env), select_visible_after(env) ]);

    env.data.entry_ids = Array.prototype.concat.apply([], results);
  };
};
