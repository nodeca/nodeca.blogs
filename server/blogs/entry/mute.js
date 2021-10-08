// Show unsubscribe page
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

    // Corner case when admin wants to unsubscribe to deleted user's blog he can see
    if (!can_see_deleted_users) {
      query.where({ exists: true });
    }

    env.data.user = await query.exec();

    if (!env.data.user) throw N.io.NOT_FOUND;
  });


  // Fill entry
  //
  N.wire.on(apiPath, async function fill_entry(env) {
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
