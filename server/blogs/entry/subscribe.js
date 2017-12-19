// Subscribe to blog entry
//
'use strict';


const _ = require('lodash');


module.exports = function (N, apiPath) {

  N.validate(apiPath, {
    entry_id: { format: 'mongo', required: true },
    type:     { type: 'integer', required: true }
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


  // Fetch entry
  //
  N.wire.before(apiPath, async function fetch_entry(env) {
    env.data.entry = await N.models.blogs.BlogEntry
                               .findById(env.params.entry_id)
                               .lean(true);

    if (!env.data.entry) throw N.io.NOT_FOUND;
  });


  // Check if user can see this entry
  //
  N.wire.before(apiPath, async function check_access(env) {
    let access_env = { params: {
      entries: env.data.entry,
      user_info: env.user_info
    } };

    await N.wire.emit('internal:blogs.access.entry', access_env);

    if (!access_env.data.access_read) throw N.io.NOT_FOUND;
  });


  // Add/remove subscription
  //
  N.wire.on(apiPath, async function subscription_add_remove(env) {
    // Use `update` with `upsert` to avoid duplicates in case of multi click
    await N.models.users.Subscription.update(
      { user: env.user_info.user_id, to: env.data.entry._id },
      {
        type: env.params.type,
        to_type: N.shared.content_type.BLOG_ENTRY
      },
      { upsert: true });
  });
};
