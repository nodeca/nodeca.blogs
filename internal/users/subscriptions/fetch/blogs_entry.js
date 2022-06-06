// Fetch blog entries for subscriptions
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


const _              = require('lodash');
const sanitize_entry = require('nodeca.blogs/lib/sanitizers/blog_entry');


module.exports = function (N, apiPath) {

  N.wire.on(apiPath, async function subscriptions_fetch_blog_entries(locals) {
    let subs = locals.params.subscriptions.filter(s => s.to_type === N.shared.content_type.BLOG_ENTRY);

    // Fetch entries
    let entries = await N.models.blogs.BlogEntry.find().where('_id').in(subs.map(s => s.to)).lean(true);

    let default_subscription_mode = await N.settings.get('default_subscription_mode', {
      user_id: locals.params.user_info.user_id,
      usergroup_ids: locals.params.user_info.usergroups
    }, {});

    // Don't show user's own entries with default subscription mode
    // (to which he could've subscribed automatically)
    let own_entry_ids = new Set(
      entries
        .filter(entry => locals.params.user_info.user_id === String(entry.user))
        .map(entry => String(entry._id))
    );
    subs = subs.filter(sub => !(
      own_entry_ids.has(String(sub.to)) &&
      sub.type === N.models.users.Subscription.types[default_subscription_mode]
    ));

    locals.count = subs.length;
    locals.res = {};
    if (!locals.count || locals.params.count_only) return;

    // Fetch users
    let query = N.models.users.User.find()
                    .where('_id').in(_.uniq(entries.map(e => e.user).map(String)));

    let can_see_deleted_users = await N.settings.get('can_see_deleted_users', {
      user_id: locals.params.user_info.user_id,
      usergroup_ids: locals.params.user_info.usergroups
    }, {});

    // Check 'can_see_deleted_users' permission
    if (!can_see_deleted_users) {
      query = query.where('exists').equals(true);
    }

    let users = await query.select('_id').lean(true);
    let users_by_id = _.keyBy(users, '_id');

    locals.users = (locals.users || []).concat(users.map(u => u._id));

    // Check permissions subcall
    //
    let access_env = { params: {
      entries,
      user_info: locals.params.user_info
    } };

    await N.wire.emit('internal:blogs.access.entry', access_env);

    entries = entries.filter((__, idx) => access_env.data.access_read[idx]);

    // Sanitize entries
    entries = await sanitize_entry(N, entries, locals.params.user_info);

    // Fetch read marks
    //
    let data = entries.map(entry => ({
      categoryId: entry.user,
      contentId: entry._id,
      lastPostNumber: entry.cache.last_comment_hid,
      lastPostTs: entry.cache.last_ts
    }));

    let read_marks = await N.models.users.Marker.info(locals.params.user_info.user_id, data, 'blog_entry');
    locals.res.read_marks = Object.assign(locals.res.read_marks || {}, read_marks);

    // avoid sending large attributes to the client that won't be used
    entries = entries.map(e =>
      _.omit(e, [ 'html' ])
    );

    let entries_by_id = _.keyBy(entries, '_id');

    locals.res.blog_entries = entries_by_id;
    locals.items = subs;


    // Fill missed subscriptions (for deleted entries)
    //
    let missed = subs.filter(s => !entries_by_id[s.to] || !users_by_id[entries_by_id[s.to].user]);

    locals.missed_subscriptions = locals.missed_subscriptions || [];
    locals.missed_subscriptions = locals.missed_subscriptions.concat(missed);
  });
};
