// Update subscription type and show unsubscribe page
//
// `WATCHING|TRACKING -> NORMAL -> MUTED`
//
'use strict';


const sanitize_entry = require('nodeca.blogs/lib/sanitizers/blog_entry');


module.exports = function (N, apiPath) {

  N.validate(apiPath, {
    user_hid:  { type: 'integer', minimum: 1, required: true },
    entry_hid: { type: 'integer', minimum: 1, required: true }
  });


  // Redirect guests to login page
  //
  N.wire.before(apiPath, async function force_login_guest(env) {
    await N.wire.emit('internal:users.force_login_guest', env);
  });


  N.wire.before(apiPath, async function fetch_blog_entry(env) {
    env.data.entry = await N.models.blogs.BlogEntry.findOne()
                               .where('hid').equals(env.params.entry_hid)
                               .lean(true);

    if (!env.data.entry) throw N.io.NOT_FOUND;

    let access_env = { params: {
      entries: env.data.entry,
      user_info: env.user_info
    } };

    await N.wire.emit('internal:blogs.access.entry', access_env);

    if (!access_env.data.access_read) throw N.io.NOT_FOUND;

    let can_see_deleted_users = await env.extras.settings.fetch('can_see_deleted_users');

    let query = N.models.users.User.findById(env.data.entry.user).lean(true);

    // Check 'can_see_deleted_users' permission
    if (!can_see_deleted_users) {
      query.where({ exists: true });
    }

    env.data.user = await query.exec();

    if (!env.data.user) throw N.io.NOT_FOUND;
  });


  // Fetch subscription
  //
  N.wire.before(apiPath, async function fetch_subscription(env) {
    env.data.subscription = await N.models.users.Subscription.findOne()
                                      .where('user').equals(env.user_info.user_id)
                                      .where('to').equals(env.data.entry._id)
                                      .where('to_type').equals(N.shared.content_type.BLOG_ENTRY)
                                      .lean(true);
  });


  // Update subscription type
  //
  N.wire.on(apiPath, async function update_subscription_type(env) {
    // Shortcut
    let Subscription = N.models.users.Subscription;

    let curType = env.data.subscription ? env.data.subscription.type : Subscription.types.NORMAL;
    let updatedType;

    if ([ Subscription.types.WATCHING, Subscription.types.TRACKING ].indexOf(curType) !== -1) {
      // `WATCHING|TRACKING -> NORMAL`
      updatedType = Subscription.types.NORMAL;
    } else if (curType === Subscription.types.NORMAL) {
      // `NORMAL -> MUTED`
      updatedType = Subscription.types.MUTED;
    } else {
      // Nothing to update here, just fill subscription type
      env.res.subscription = curType;
      return;
    }

    // Fill subscription type
    env.res.subscription = updatedType;

    // Update with `upsert` to avoid duplicates
    await Subscription.updateOne(
      { user: env.user_info.user_id, to: env.data.entry._id },
      { type: updatedType, to_type: N.shared.content_type.BLOG_ENTRY },
      { upsert: true }
    );
  });


  // Fill entry
  //
  N.wire.after(apiPath, async function fill_entry(env) {
    env.res.entry = await sanitize_entry(N, env.data.entry, env.user_info);

    env.data.users = env.data.users || [];
    env.data.users.push(env.data.user._id);

    env.res.user_id = env.data.user._id;
  });


  // Fill head meta
  //
  N.wire.after(apiPath, function fill_meta(env) {
    env.res.head = env.res.head || {};

    env.res.head.title = env.t('title');
  });
};
