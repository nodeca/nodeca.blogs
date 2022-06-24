// Get blog comments created by a user
//
// In:
//
// - params.user_id
// - params.user_info
// - params.start - starting point (comment id, optional, default: most recent one)
// - params.before - number of visible comments fetched before start
// - params.after - number of visible comments fetched after start
//
// Out:
//
// - results - array of results, each one is { comment, entry }
// - users - array of user ids needed to fetch
// - reached_top
// - reached_bottom
//

'use strict';


const _                = require('lodash');
const sanitize_entry   = require('nodeca.blogs/lib/sanitizers/blog_entry');
const sanitize_comment = require('nodeca.blogs/lib/sanitizers/blog_comment');


module.exports = function (N, apiPath) {

  // Separate method used to return number of items
  //
  N.wire.on(apiPath + ':count', async function activity_blog_comment_count(locals) {
    locals.count = await N.models.blogs.UserBlogCommentCount.get(locals.params.user_id, locals.params.user_info);
  });


  // Initialize internal state
  //
  N.wire.before(apiPath, { priority: -20 }, async function init_activity_env(locals) {
    locals.sandbox = {};

    // get visible statuses
    locals.sandbox.countable_statuses = [ N.models.blogs.BlogComment.statuses.VISIBLE ];

    // NOTE: do not count deleted posts, since permissions may be different
    //       for different sections, depending on usergroup and moderator
    //       permissions; deleted posts will be checked and filtered out later
    if (locals.params.user_info.hb) locals.sandbox.countable_statuses.push(N.models.blogs.BlogComment.statuses.HB);
  });


  // Find first visible comment
  //
  N.wire.before(apiPath, { parallel: true }, async function find_comment_range_before(locals) {
    if (!locals.params.before) {
      locals.sandbox.first_id = locals.params.start;
      return;
    }

    let query = N.models.blogs.BlogComment.findOne()
                    .where('user').equals(locals.params.user_id)
                    .where('st').in(locals.sandbox.countable_statuses)
                    .where('entry_exists').equals(true)
                    .skip(locals.params.before)
                    .sort('_id')
                    .select('_id');

    if (locals.params.start) {
      query = query.where('_id').gt(locals.params.start);
    }

    let first_comment = await query.lean(true);

    if (!first_comment) {
      locals.sandbox.first_id = null;
      return;
    }

    locals.sandbox.first_id = String(first_comment._id);
  });


  // Find last visible comment
  //
  N.wire.before(apiPath, { parallel: true }, async function find_comment_range_after(locals) {
    if (!locals.params.after) {
      locals.sandbox.last_id = locals.params.start;
      return;
    }

    let query = N.models.blogs.BlogComment.findOne()
                    .where('user').equals(locals.params.user_id)
                    .where('st').in(locals.sandbox.countable_statuses)
                    .where('entry_exists').equals(true)
                    .skip(locals.params.after)
                    .sort('-_id')
                    .select('_id');

    if (locals.params.start) {
      query = query.where('_id').lt(locals.params.start);
    }

    let last_comment = await query.lean(true);

    if (!last_comment) {
      locals.sandbox.last_id = null;
      return;
    }

    locals.sandbox.last_id = String(last_comment._id);
  });


  // Find comments
  //
  N.wire.on(apiPath, async function find_comments(locals) {
    let query = N.models.blogs.BlogComment.find()
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

    locals.sandbox.comments = await query.lean(true);

    locals.sandbox.entries = await N.models.blogs.BlogEntry.find()
                                      .where('_id')
                                      .in(_.uniq(locals.sandbox.comments.map(comment => String(comment.entry))))
                                      .lean(true);

    locals.reached_top    = !locals.sandbox.first_id;
    locals.reached_bottom = !locals.sandbox.last_id;
  });


  // Check permissions for each comment
  //
  N.wire.on(apiPath, async function check_permissions(locals) {
    if (!locals.sandbox.comments.length) return;

    let entries_by_id = _.keyBy(locals.sandbox.entries, '_id');

    let entries_used = {};

    let access_env = { params: {
      comments: locals.sandbox.comments,
      user_info: locals.params.user_info,
      preload: locals.sandbox.entries
    } };

    await N.wire.emit('internal:blogs.access.comment', access_env);

    locals.sandbox.comments = locals.sandbox.comments.filter((comment, idx) => {
      let entry = entries_by_id[comment.entry];
      if (!entry) return;

      if (access_env.data.access_read[idx]) {
        entries_used[entry._id] = entry;
        return true;
      }

      return false;
    });

    locals.sandbox.entries = Object.values(entries_used);
  });


  // Sanitize results
  //
  N.wire.on(apiPath, async function sanitize(locals) {
    if (!locals.sandbox.entries.length) return;

    locals.sandbox.comments = await sanitize_comment(N, locals.sandbox.comments, locals.params.user_info);
    locals.sandbox.entries  = await sanitize_entry(N, locals.sandbox.entries, locals.params.user_info);

    // avoid sending large attributes to the client that won't be used
    locals.sandbox.entries = locals.sandbox.entries.map(e =>
      _.omit(e, [ 'html' ])
    );
  });


  // Fill results
  //
  N.wire.on(apiPath, function fill_results(locals) {
    locals.results = [];

    let entries_by_id = _.keyBy(locals.sandbox.entries, '_id');

    locals.sandbox.comments.forEach(comment => {
      let entry = entries_by_id[comment.entry];
      if (!entry) return;

      locals.results.push({ comment, entry });
    });
  });


  // Fill users
  //
  N.wire.on(apiPath, function fill_users(locals) {
    let users = {};

    locals.results.forEach(result => {
      let { entry, comment } = result;

      if (entry.user) users[entry.user] = true;
      if (entry.del_by) users[entry.del_by] = true;
      if (comment.user) users[comment.user] = true;
      if (comment.del_by) users[comment.del_by] = true;
      if (comment.import_users) comment.import_users.forEach(id => { users[id] = true; });
    });

    locals.users = Object.keys(users);
  });


  // Fetch pagination and last topic id
  //
  N.wire.after(apiPath, async function fetch_pagination(locals) {
    //
    // Count total amount of visible topics
    //
    let comment_count = await N.models.blogs.BlogComment.countDocuments()
                                  .where('user').equals(locals.params.user_id)
                                  .where('st').in(locals.sandbox.countable_statuses)
                                  .where('entry_exists').equals(true);

    //
    // Count an amount of visible topics before the first one
    //
    let comment_offset = 0;

    if (locals.results.length) {
      comment_offset = await N.models.blogs.BlogComment.countDocuments()
                                 .where('user').equals(locals.params.user_id)
                                 .where('st').in(locals.sandbox.countable_statuses)
                                 .where('entry_exists').equals(true)
                                 .where('_id').gt(locals.results[0].comment._id);
    }

    let last_comment = await N.models.blogs.BlogComment.findOne()
                                 .where('user').equals(locals.params.user_id)
                                 .where('st').in(locals.sandbox.countable_statuses)
                                 .where('entry_exists').equals(true)
                                 .sort('_id')
                                 .select('_id')
                                 .lean(true);

    locals.pagination = {
      total:        comment_count,
      per_page:     20, // unused
      chunk_offset: comment_offset
    };

    locals.last_item_id = last_comment?._id;
  });
};
