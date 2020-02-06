// Fetch bookmark data for blog entries
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


const _              = require('lodash');
const sanitize_entry = require('nodeca.blogs/lib/sanitizers/blog_entry');


module.exports = function (N, apiPath) {

  // Find entries
  //
  N.wire.on(apiPath, async function find_entries(locals) {
    locals.sandbox = {};

    locals.sandbox.entries = await N.models.blogs.BlogEntry.find()
                                       .where('_id').in(_.map(locals.params.bookmarks, 'src'))
                                       .lean(true);

    locals.sandbox.blog_users = await N.models.users.User.find()
                                          .where('_id')
                                          .in(_.uniq(locals.sandbox.entries.map(entry => String(entry.user))))
                                          .select('hid') // only need hid to generate url for profile widget
                                          .lean(true);
  });


  // Check permissions for each entry
  //
  N.wire.on(apiPath, async function check_permissions(locals) {
    if (!locals.sandbox.entries.length) return;

    let is_entry_public = {};

    let access_env = { params: {
      entries: locals.sandbox.entries,
      user_info: '000000000000000000000000' // guest
    } };

    await N.wire.emit('internal:blogs.access.entry', access_env);

    locals.sandbox.entries = locals.sandbox.entries.filter((entry, idx) => {
      if (access_env.data.access_read[idx]) {
        is_entry_public[entry._id] = true;
        return true;
      }

      return false;
    });

    // Refresh "public" field in bookmarks
    //
    let bulk = N.models.users.Bookmark.collection.initializeUnorderedBulkOp();

    locals.params.bookmarks.forEach(bookmark => {
      if (bookmark.public === !!is_entry_public[bookmark.src]) return;

      bulk.find({
        _id: bookmark._id
      }).update({
        $set: {
          public: !!is_entry_public[bookmark.src]
        }
      });
    });

    if (bulk.length > 0) await bulk.execute();
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

    let entries_by_id = _.keyBy(locals.sandbox.entries, '_id');
    let users_by_id   = _.keyBy(locals.sandbox.blog_users, '_id');

    locals.params.bookmarks.forEach(bookmark => {
      let entry = entries_by_id[bookmark.src];
      if (!entry) return;

      let user = users_by_id[entry.user];
      if (!user) return;

      locals.results.push({
        _id: bookmark._id,
        type: 'blog_entry',
        title: entry.title,
        url: N.router.linkTo('blogs.entry', {
          user_hid:  user.hid,
          entry_hid: entry.hid
        }),
        entry
      });
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
};
