// Fetch blogs for subscriptions
//
// In:
//
//  - params.user_info
//  - params.subscriptions
//  - params.count_only
//
// Out:
//
//  - count
//  - items
//  - missed_subscriptions - list of subscriptions for deleted topics
//                           (those subscriptions will be deleted later)
//  - res   - misc data (specific to template, merged with env.res)
//
'use strict';


const _  = require('lodash');


module.exports = function (N, apiPath) {

  N.wire.on(apiPath, async function subscriptions_fetch_blogs(locals) {
    let subs = locals.params.subscriptions.filter(s => s.to_type === N.shared.content_type.BLOG_SOLE);

    locals.count = subs.length;
    locals.res = {};
    if (!locals.count || locals.params.count_only) return;

    let can_see_deleted_users = await N.settings.get('can_see_deleted_users', {
      user_id: locals.params.user_info.user_id,
      usergroup_ids: locals.params.user_info.usergroups
    }, {});

    // Fetch users
    let query = N.models.users.User.find()
                    .where('_id').in(subs.map(s => s.to));

    // Check 'can_see_deleted_users' permission
    if (!can_see_deleted_users) {
      query = query.where('exists').equals(true);
    }

    let users = await query.select('_id').lean(true);
    let users_by_id = _.keyBy(users, '_id');

    locals.users = (locals.users || []).concat(users.map(u => u._id));
    locals.items = subs;


    // Fill missed subscriptions (for deleted users)
    //
    let missed = subs.filter(s => !users_by_id[s.to]);

    locals.missed_subscriptions = locals.missed_subscriptions || [];
    locals.missed_subscriptions = locals.missed_subscriptions.concat(missed);
  });
};
