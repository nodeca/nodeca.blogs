// Update subscription type and show unsubscribe page
//
// `WATCHING|TRACKING -> NORMAL -> MUTED`
//
'use strict';


module.exports = function (N, apiPath) {

  N.validate(apiPath, {
    user_hid: { type: 'integer', minimum: 1, required: true }
  });


  // Redirect guests to login page
  //
  N.wire.before(apiPath, async function force_login_guest(env) {
    await N.wire.emit('internal:users.force_login_guest', env);
  });


  // Get blog owner
  //
  N.wire.before(apiPath, function fetch_user_by_hid(env) {
    return N.wire.emit('internal:users.fetch_user_by_hid', env);
  });


  // Fetch subscription
  //
  N.wire.before(apiPath, async function fetch_subscription(env) {
    env.data.subscription = await N.models.users.Subscription.findOne()
                                      .where('user').equals(env.user_info.user_id)
                                      .where('to').equals(env.data.user._id)
                                      .where('to_type').equals(N.shared.content_type.BLOG_SOLE)
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
    await Subscription.update(
      { user: env.user_info.user_id, to: env.data.user._id },
      { type: updatedType, to_type: N.shared.content_type.BLOG_SOLE },
      { upsert: true }
    );
  });


  // Fill user
  //
  N.wire.after(apiPath, async function fill_entry(env) {
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
