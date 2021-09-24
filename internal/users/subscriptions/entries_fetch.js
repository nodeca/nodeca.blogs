// Fetch blog entries for subscriptions
//
// In:
//
//  - env.user_info
//  - env.subscriptions
//
// Out:
//
//  - env.data.missed_subscriptions - list of subscriptions for deleted topics
//                                    (those subscriptions will be deleted later)
//  - env.res.read_marks
//  - env.data.users
//  - env.res.blog_entries - template-specific data
//
'use strict';


const _              = require('lodash');
const sanitize_entry = require('nodeca.blogs/lib/sanitizers/blog_entry');


module.exports = function (N) {

  N.wire.on('internal:users.subscriptions.fetch', async function subscriptions_fetch_blog_entries(env) {
    let subs = env.data.subscriptions.filter(s => s.to_type === N.shared.content_type.BLOG_ENTRY);

    if (!subs.length) return;

    // Fetch entries
    let entries = await N.models.blogs.BlogEntry.find().where('_id').in(subs.map(s => s.to)).lean(true);

    // Fetch users
    let query = N.models.users.User.find()
                    .where('_id').in(_.uniq(entries.map(e => e.user).map(String)));

    let can_see_deleted_users = await env.extras.settings.fetch('can_see_deleted_users');

    // Check 'can_see_deleted_users' permission
    if (!can_see_deleted_users) {
      query = query.where('exists').equals(true);
    }

    let users = await query.select('_id').lean(true);
    let users_by_id = _.keyBy(users, '_id');

    env.data.users = (env.data.users || []).concat(users.map(u => u._id));

    // Check permissions subcall
    //
    let access_env = { params: {
      entries,
      user_info: env.user_info
    } };

    await N.wire.emit('internal:blogs.access.entry', access_env);

    entries = entries.filter((__, idx) => access_env.data.access_read[idx]);

    // Sanitize entries
    entries = await sanitize_entry(N, entries, env.user_info);

    // Fetch read marks
    //
    let data = entries.map(entry => ({
      categoryId: entry.user,
      contentId: entry._id,
      lastPostNumber: entry.cache.last_comment_hid,
      lastPostTs: entry.cache.last_ts
    }));

    let read_marks = await N.models.users.Marker.info(env.user_info.user_id, data);
    env.res.read_marks = Object.assign(env.res.read_marks || {}, read_marks);

    // avoid sending large attributes to the client that won't be used
    entries = entries.map(e =>
      _.omit(e, [ 'html' ])
    );

    let entries_by_id = _.keyBy(entries, '_id');

    env.res.blog_entries = entries_by_id;


    // Fill missed subscriptions (for deleted entries)
    //
    let missed = subs.filter(s => !entries_by_id[s.to] || !users_by_id[entries_by_id[s.to].user]);

    env.data.missed_subscriptions = env.data.missed_subscriptions || [];
    env.data.missed_subscriptions = env.data.missed_subscriptions.concat(missed);
  });
};
