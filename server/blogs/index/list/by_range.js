// Get a specified amount of entries before or after entry with given _id
//
'use strict';


const _       = require('lodash');
const Promise = require('bluebird');

const LIMIT = 50; // max entries to fetch before and after


module.exports = function (N, apiPath) {

  N.validate(apiPath, {
    start:  { format: 'mongo', required: true },
    before: { type: 'integer', minimum: 0, maximum: LIMIT, required: true },
    after:  { type: 'integer', minimum: 0, maximum: LIMIT, required: true }
  });


  let build_entry_ids = require('./_build_entry_ids_by_range')(N);


  // Subcall blogs.entry_list
  //
  N.wire.on(apiPath, function subcall_entry_list(env) {
    env.data.select_start    = env.params.start;
    env.data.select_before   = env.params.before;
    env.data.select_after    = env.params.after;
    env.data.build_entry_ids = build_entry_ids;

    return N.wire.emit('internal:blogs.entry_list', env);
  });


  // Fill 'prev' and 'next' links and meta tags
  //
  N.wire.after(apiPath, async function fill_prev_next(env) {
    env.res.head = env.res.head || {};

    //
    // Fetch entry after last one, turn it into a link to the next page
    //
    if (env.params.after > 0 && env.data.entries.length > 0) {
      let last_entry_id = env.data.entries[env.data.entries.length - 1]._id;

      let entry = await N.models.blogs.BlogEntry.findOne()
                            .where('_id').lt(last_entry_id)
                            .where('st').in(env.data.blog_entries_visible_statuses)
                            .select('_id')
                            .sort('-_id')
                            .lean(true);

      // `entry` is only used to check if there is a post afterwards
      if (entry) {
        env.res.head.next = N.router.linkTo('blogs.index', {
          $query: {
            from: String(env.data.entries[env.data.entries.length - 1].hid),
            next: ''
          }
        });
      }
    }

    //
    // Fetch entry before first one, turn it into a link to the previous page
    //
    if (env.params.before > 0 && env.data.entries.length > 0) {
      let last_entry_id = env.data.entries[0]._id;

      let entry = await N.models.blogs.BlogEntry.findOne()
                            .where('_id').gt(last_entry_id)
                            .where('st').in(env.data.blog_entries_visible_statuses)
                            .select('_id')
                            .sort('_id')
                            .lean(true);

      // `entry` is only used to check if there is a post afterwards
      if (entry) {
        env.res.head.prev = N.router.linkTo('blogs.index', {
          $query: {
            from: String(env.data.entries[0].hid),
            prev: ''
          }
        });
      }
    }
  });


  // Fill pagination (progress)
  //
  N.wire.after(apiPath, async function fill_pagination(env) {
    //
    // Count total amount of visible blog entries
    //
    let counters_by_status = await Promise.map(
      env.data.blog_entries_visible_statuses,
      st => N.models.blogs.BlogEntry
                .where('st').equals(st)
                .count()
    );

    let total = _.sum(counters_by_status);

    //
    // Count an amount of visible blog entries before the first displayed
    //
    let offset = 0;

    if (env.data.entries.length) {
      let counters_by_status = await Promise.map(
        env.data.blog_entries_visible_statuses,
        st => N.models.blogs.BlogEntry
                  .where('st').equals(st)
                  .where('_id').gt(env.data.entries[0]._id)
                  .count()
      );

      offset = _.sum(counters_by_status);
    }

    env.res.pagination = {
      total,
      per_page:     await env.extras.settings.fetch('blog_entries_per_page'),
      chunk_offset: offset
    };
  });
};
