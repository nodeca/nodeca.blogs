// Fetch blogs for subscriptions
//
'use strict';


const _  = require('lodash');


module.exports = function (N) {

  N.wire.on('internal:users.subscriptions.fetch', async function subscriptions_fetch_blogs(env) {
    let subs = _.filter(env.data.subscriptions, { to_type: N.shared.content_type.BLOG_SOLE });

    if (!subs.length) return;

    let can_see_deleted_users = await env.extras.settings.fetch('can_see_deleted_users');

    // Fetch users
    let query = N.models.users.User.find()
                    .where('_id').in(subs.map(s => s.to));

    // Check 'can_see_deleted_users' permission
    if (!can_see_deleted_users) {
      query = query.where('exists').equals(true);
    }

    let users = await query.select('_id').lean(true);
    let users_by_id = _.keyBy(users, '_id');

    env.data.users = (env.data.users || []).concat(users.map(u => u._id));


    // Fill missed subscriptions (for deleted users)
    //
    let missed = _.filter(subs, s => !users_by_id[s.to]);

    env.data.missed_subscriptions = env.data.missed_subscriptions || [];
    env.data.missed_subscriptions = env.data.missed_subscriptions.concat(missed);
  });
};
