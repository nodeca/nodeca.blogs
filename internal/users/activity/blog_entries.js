// Get blog entries created by a user
//
// In:
//
// - params.user_id
// - params.user_info
// - params.start - starting point (entry id, optional, default: most recent one)
// - params.before - number of visible entries fetched before start
// - params.after - number of visible entries fetched after start
//
// Out:
//
// - results - array of results, each one is { entry }
// - users - array of user ids needed to fetch
// - reached_top
// - reached_bottom
//

'use strict';


const sanitize_entry = require('nodeca.blogs/lib/sanitizers/blog_entry');


module.exports = function (N, apiPath) {

  // Separate method used to return number of items
  //
  N.wire.on(apiPath + ':count', async function activity_blog_entry_count(locals) {
    locals.count = await N.models.blogs.UserBlogEntryCount.get(locals.params.user_id, locals.params.user_info);
  });


  // Initialize internal state
  //
  N.wire.before(apiPath, { priority: -20 }, async function init_activity_env(locals) {
    locals.sandbox = {};

    // get visible statuses
    locals.sandbox.countable_statuses = [ N.models.blogs.BlogEntry.statuses.VISIBLE ];

    // NOTE: do not count deleted posts, since permissions may be different
    //       for different sections, depending on usergroup and moderator
    //       permissions; deleted posts will be checked and filtered out later
    if (locals.params.user_info.hb) locals.sandbox.countable_statuses.push(N.models.blogs.BlogEntry.statuses.HB);
  });


  // Find first visible entry
  //
  N.wire.before(apiPath, { parallel: true }, async function find_entry_range_before(locals) {
    if (!locals.params.before) {
      locals.sandbox.first_id = locals.params.start;
      return;
    }

    let query = N.models.blogs.BlogEntry.findOne()
                    .where('user').equals(locals.params.user_id)
                    .where('st').in(locals.sandbox.countable_statuses)
                    .skip(locals.params.before)
                    .sort('_id')
                    .select('_id');

    if (locals.params.start) {
      query = query.where('_id').gt(locals.params.start);
    }

    let first_entry = await query.lean(true);

    if (!first_entry) {
      locals.sandbox.first_id = null;
      return;
    }

    locals.sandbox.first_id = String(first_entry._id);
  });


  // Find last visible entry
  //
  N.wire.before(apiPath, { parallel: true }, async function find_entry_range_after(locals) {
    if (!locals.params.after) {
      locals.sandbox.last_id = locals.params.start;
      return;
    }

    let query = N.models.blogs.BlogEntry.findOne()
                    .where('user').equals(locals.params.user_id)
                    .where('st').in(locals.sandbox.countable_statuses)
                    .skip(locals.params.after)
                    .sort('-_id')
                    .select('_id');

    if (locals.params.start) {
      query = query.where('_id').lt(locals.params.start);
    }

    let last_entry = await query.lean(true);

    if (!last_entry) {
      locals.sandbox.last_id = null;
      return;
    }

    locals.sandbox.last_id = String(last_entry._id);
  });


  // Find entries
  //
  N.wire.on(apiPath, async function find_entries(locals) {
    let query = N.models.blogs.BlogEntry.find()
                    .where('user').equals(locals.params.user_id)
                    .sort('-_id');

    if (locals.params.before) {
      query = locals.sandbox.first_id ? query.where('_id').lt(locals.sandbox.first_id) : query;
    } else {
      query = locals.params.start ? query.where('_id').lte(locals.params.start) : query;
    }

    if (locals.params.after) {
      query = locals.sandbox.last_id ? query.where('_id').gt(locals.sandbox.last_id) : query;
    } else {
      query = locals.params.start ? query.where('_id').gte(locals.params.start) : query;
    }

    locals.sandbox.entries = await query.lean(true);

    locals.reached_top    = !locals.sandbox.first_id;
    locals.reached_bottom = !locals.sandbox.last_id;
  });


  // Check permissions for each entry
  //
  N.wire.on(apiPath, async function check_permissions(locals) {
    if (!locals.sandbox.entries.length) return;

    let access_env = { params: {
      entries: locals.sandbox.entries,
      user_info: locals.params.user_info
    } };

    await N.wire.emit('internal:blogs.access.entry', access_env);

    locals.sandbox.entries = locals.sandbox.entries.filter((entry, idx) => {
      return access_env.data.access_read[idx];
    });
  });


  // Sanitize results
  //
  N.wire.on(apiPath, async function sanitize(locals) {
    if (!locals.sandbox.entries.length) return;

    locals.sandbox.entries = await sanitize_entry(N, locals.sandbox.entries, locals.params.user_info);
  });


  // Fill results
  //
  N.wire.on(apiPath, function fill_results(locals) {
    locals.results = [];

    locals.sandbox.entries.forEach(entry => {
      locals.results.push({ entry });
    });
  });


  // Fill users
  //
  N.wire.on(apiPath, function fill_users(locals) {
    let users = {};

    locals.results.forEach(result => {
      let entry = result.entry;

      if (entry.user) users[entry.user] = true;
      if (entry.del_by) users[entry.del_by] = true;
      if (entry.import_users) entry.import_users.forEach(id => { users[id] = true; });
    });

    locals.users = Object.keys(users);
  });


  // Fetch pagination and last topic id
  //
  N.wire.after(apiPath, async function fetch_pagination(locals) {
    //
    // Count total amount of visible topics
    //
    let entry_count = await N.models.blogs.BlogEntry.countDocuments()
                                .where('user').equals(locals.params.user_id)
                                .where('st').in(locals.sandbox.countable_statuses);

    //
    // Count an amount of visible topics before the first one
    //
    let entry_offset = 0;

    if (locals.results.length) {
      entry_offset = await N.models.blogs.BlogEntry.countDocuments()
                               .where('user').equals(locals.params.user_id)
                               .where('st').in(locals.sandbox.countable_statuses)
                               .where('_id').gt(locals.results[0].entry._id);
    }

    let last_entry = await N.models.blogs.BlogEntry.findOne()
                               .where('user').equals(locals.params.user_id)
                               .where('st').in(locals.sandbox.countable_statuses)
                               .sort('_id')
                               .select('_id')
                               .lean(true);

    locals.pagination = {
      total:        entry_count,
      per_page:     20, // unused
      chunk_offset: entry_offset
    };

    locals.last_item_id = last_entry?._id;
  });
};
