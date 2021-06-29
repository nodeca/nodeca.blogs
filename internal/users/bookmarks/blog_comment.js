// Fetch bookmark data for blog comments
//
// In:
//
// - params.bookmarks - Array of N.models.users.Bookmark objects
// - params.user_info
//
// Out:
//
// - results - array of results corresponding to input bookmarks
// - users - array of user ids needed to fetch
//

'use strict';


const _                = require('lodash');
const sanitize_entry   = require('nodeca.blogs/lib/sanitizers/blog_entry');
const sanitize_comment = require('nodeca.blogs/lib/sanitizers/blog_comment');


module.exports = function (N, apiPath) {

  // Find comments
  //
  N.wire.on(apiPath, async function find_comments(locals) {
    locals.sandbox = {};

    locals.sandbox.comments = await N.models.blogs.BlogComment.find()
                                        .where('_id').in(locals.params.bookmarks.map(x => x.src))
                                        .lean(true);

    locals.sandbox.entries = await N.models.blogs.BlogEntry.find()
                                       .where('_id')
                                       .in(_.uniq(locals.sandbox.comments.map(comment => String(comment.entry))))
                                       .lean(true);

    locals.sandbox.blog_users = await N.models.users.User.find()
                                          .where('_id')
                                          .in(_.uniq(locals.sandbox.entries.map(entry => String(entry.user))))
                                          .select('hid') // only need hid to generate url for profile widget
                                          .lean(true);
  });


  // Check permissions for each comment
  //
  N.wire.on(apiPath, async function check_permissions(locals) {
    if (!locals.sandbox.comments.length) return;

    let entries_by_id = _.keyBy(locals.sandbox.entries, '_id');

    let is_comment_public = {};

    let entries_used = {};

    let access_env = { params: {
      comments: locals.sandbox.comments,
      user_info: '000000000000000000000000', // guest
      preload: locals.sandbox.entries
    } };

    await N.wire.emit('internal:blogs.access.comment', access_env);

    locals.sandbox.comments = locals.sandbox.comments.filter((comment, idx) => {
      let entry = entries_by_id[comment.entry];
      if (!entry) return;

      if (access_env.data.access_read[idx]) {
        entries_used[entry._id] = entry;
        is_comment_public[comment._id] = true;
        return true;
      }

      return false;
    });

    locals.sandbox.entries = _.values(entries_used);

    // Refresh "public" field in bookmarks
    //
    let bulk = N.models.users.Bookmark.collection.initializeUnorderedBulkOp();

    locals.params.bookmarks.forEach(bookmark => {
      if (bookmark.public === !!is_comment_public[bookmark.src]) return;

      bulk.find({
        _id: bookmark._id
      }).update({
        $set: {
          public: !!is_comment_public[bookmark.src]
        }
      });
    });

    if (bulk.length > 0) await bulk.execute();
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

    let comments_by_id = _.keyBy(locals.sandbox.comments, '_id');
    let entries_by_id  = _.keyBy(locals.sandbox.entries, '_id');
    let users_by_id    = _.keyBy(locals.sandbox.blog_users, '_id');

    locals.params.bookmarks.forEach(bookmark => {
      let comment = comments_by_id[bookmark.src];
      if (!comment) return;

      let entry = entries_by_id[comment.entry];
      if (!entry) return;

      let user = users_by_id[entry.user];
      if (!user) return;

      locals.results.push({
        _id: bookmark._id,
        type: 'blog_comment',
        title: entry.title + ' #' + comment.hid,
        url: N.router.linkTo('blogs.entry', {
          user_hid:  user.hid,
          entry_hid: entry.hid,
          $anchor:   'comment' + comment.hid
        }),
        entry,
        comment
      });
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
};
