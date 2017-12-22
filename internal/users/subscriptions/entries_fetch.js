// Fetch blog entries for subscriptions
//
'use strict';


const _              = require('lodash');
const sanitize_entry = require('nodeca.blogs/lib/sanitizers/blog_entry');


module.exports = function (N) {

  N.wire.on('internal:users.subscriptions.fetch', async function subscriptions_fetch_blog_entries(env) {
    let subs = _.filter(env.data.subscriptions, { to_type: N.shared.content_type.BLOG_ENTRY });

    if (!subs.length) return;

    // Fetch entries
    let entries = await N.models.blogs.BlogEntry.find().where('_id').in(_.map(subs, 'to')).lean(true);

    // Fetch users
    let query = N.models.users.User.find()
                    .where('_id').in(_.uniq(_.map(entries, 'user').map(String)));

    let can_see_deleted_users = await env.extras.settings.fetch('can_see_deleted_users');

    // Check 'can_see_deleted_users' permission
    if (!can_see_deleted_users) {
      query = query.where('exists').equals(true);
    }

    let users = await query.select('_id').lean(true);
    let users_by_id = _.keyBy(users, '_id');

    env.data.users = (env.data.users || []).concat(_.map(users, '_id'));

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

    let entries_by_id = _.keyBy(entries, '_id');

    env.res.blog_entries = entries_by_id;


    // Fill missed subscriptions (for deleted entries)
    //
    let missed = _.filter(subs, s => !entries_by_id[s.to] || !users_by_id[entries_by_id[s.to].user]);

    env.data.missed_subscriptions = env.data.missed_subscriptions || [];
    env.data.missed_subscriptions = env.data.missed_subscriptions.concat(missed);
  });
};
