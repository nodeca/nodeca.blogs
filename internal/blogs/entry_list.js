// Get blog entry list with all data needed to render it
//
// in:
//
// - env.data.build_entry_ids (env) - should fill `env.data.entry_ids` with correct sorting order
//
// out:
//
//   env:
//     res:
//       entries: ...       # sanitized, with restricted fields
//       ignored_users: ... # hash { ignored_user_id => true }
//     data:
//       blog_entries_visible_statuses: ...
//       settings: ...
//       entries: ...
//       users: ...
//
'use strict';


const _              = require('lodash');
const sanitize_entry = require('nodeca.blogs/lib/sanitizers/blog_entry');

let setting_names = [
  'blogs_show_ignored',
  'blogs_mod_can_delete',
  'blogs_mod_can_see_hard_deleted',
  'can_see_hellbanned',
  'can_see_ip',
  'can_report_abuse'
];


module.exports = function (N, apiPath) {

  // Fetch and fill permissions
  //
  N.wire.before(apiPath, async function fetch_and_fill_permissions(env) {
    env.res.settings = env.data.settings = await env.extras.settings.fetch(setting_names);
  });


  // Define visible statuses
  //
  N.wire.before(apiPath, function define_visible_statuses(env) {
    let statuses = N.models.blogs.BlogEntry.statuses;

    env.data.blog_entries_visible_statuses = [ statuses.VISIBLE ];

    if (env.data.settings.blogs_mod_can_delete) {
      env.data.blog_entries_visible_statuses.push(statuses.DELETED);
    }

    if (env.data.settings.blogs_mod_can_see_hard_deleted) {
      env.data.blog_entries_visible_statuses.push(statuses.DELETED_HARD);
    }

    if (env.data.settings.can_see_hellbanned || env.user_info.hb) {
      env.data.blog_entries_visible_statuses.push(statuses.HB);
    }
  });


  // Get entry ids
  //
  N.wire.before(apiPath, function get_entry_ids(env) {
    return env.data.build_entry_ids(env);
  });


  // Fetch and sort blog entries
  //
  N.wire.on(apiPath, async function fetch_and_sort_entries(env) {
    let entries = await N.models.blogs.BlogEntry.find()
                            .where('_id').in(env.data.entry_ids)
                            .where('st').in(env.data.blog_entries_visible_statuses)
                            .lean(true);

    env.data.entries = [];

    // Sort in `env.data.entry_ids` order.
    // May be slow on large volumes
    env.data.entry_ids.forEach(id => {
      let entry = _.find(entries, e => e._id.equals(id));

      if (entry) {
        env.data.entries.push(entry);
      }
    });
  });


  // Collect users
  //
  N.wire.after(apiPath, function collect_users(env) {
    env.data.users = env.data.users || [];

    env.data.entries.forEach(entry => {
      if (entry.user) {
        env.data.users.push(entry.user);
      }
      if (entry.import_users) {
        env.data.users = env.data.users.concat(entry.import_users);
      }
    });
  });


  // Check if any users are ignored
  //
  N.wire.after(apiPath, async function check_ignores(env) {
    let users = env.data.entries.map(post => post.user).filter(Boolean);

    // don't fetch `_id` to load all data from composite index
    let ignored = await N.models.users.Ignore.find()
                            .where('from').equals(env.user_info.user_id)
                            .where('to').in(users)
                            .select('from to -_id')
                            .lean(true);

    env.res.ignored_users = env.res.ignored_users || {};

    ignored.forEach(row => {
      env.res.ignored_users[row.to] = true;
    });
  });


  // Sanitize and fill blog entries
  //
  N.wire.after(apiPath, async function blog_entries_sanitize_and_fill(env) {
    env.res.entries = await sanitize_entry(N, env.data.entries, env.user_info);
  });
};
