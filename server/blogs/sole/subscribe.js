// Subscribe to blog
//
'use strict';


const _ = require('lodash');


module.exports = function (N, apiPath) {

  N.validate(apiPath, {
    user_id: { format: 'mongo', required: true },
    type:    { type: 'integer', required: true }
  });


  // Check type
  //
  N.wire.before(apiPath, function check_type(env) {
    if (_.values(N.models.users.Subscription.types).indexOf(env.params.type) === -1) {
      return N.io.BAD_REQUEST;
    }
  });


  // Check auth
  //
  N.wire.before(apiPath, function check_auth(env) {
    if (!env.user_info.is_member) throw N.io.FORBIDDEN;
  });


  // Fetch user by id
  //
  N.wire.before(apiPath, async function fetch_user_by_id(env) {
    let query = N.models.users.User.findById(env.params.user_id);

    let can_see_deleted_users = await env.extras.settings.fetch('can_see_deleted_users');

    // Check 'can_see_deleted_users' permission
    if (!can_see_deleted_users) {
      query.where('exists').equals(true);
    }

    env.data.user = await query.lean(true);

    if (!env.data.user) throw N.io.NOT_FOUND;
  });


  // Add/remove subscription
  //
  N.wire.on(apiPath, async function subscription_add_remove(env) {
    // Use `update` with `upsert` to avoid duplicates in case of multi click
    await N.models.users.Subscription.updateOne(
      { user: env.user_info.user_id, to: env.data.user._id },
      {
        type: env.params.type,
        to_type: N.shared.content_type.BLOG_SOLE
      },
      { upsert: true });
  });
};
