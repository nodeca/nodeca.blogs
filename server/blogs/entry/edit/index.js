// Get blog entry source, update entry
//
'use strict';


module.exports = function (N, apiPath) {

  N.validate(apiPath, {
    entry_id: { format: 'mongo', required: true }
  });


  // Check auth
  //
  N.wire.before(apiPath, function check_user_auth(env) {
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


  // Check permissions
  //
  N.wire.before(apiPath, async function check_permissions(env) {
    let can_create = await env.extras.settings.fetch('blogs_can_create');

    if (!can_create) throw N.io.FORBIDDEN;

    if (String(env.user_info.user_id) !== String(env.data.entry.user)) {
      throw N.io.FORBIDDEN;
    }
  });


  // Fetch parser params
  //
  N.wire.before(apiPath, async function fetch_parser_params(env) {
    env.data.parser_params = await N.models.core.MessageParams.getParams(env.data.entry.params_ref);
  });


  // Fill entry data
  //
  N.wire.on(apiPath, function fill_data(env) {
    env.data.users = env.data.users || [];

    if (env.data.entry.user)   env.data.users.push(env.data.entry.user);
    if (env.data.entry.del_by) env.data.users.push(env.data.entry.del_by);

    if (env.data.entry.import_users) {
      env.data.users = env.data.users.concat(env.data.entry.import_users);
    }

    env.res.user_id = env.data.entry.user;
    env.res.md = env.data.entry.md;
    env.res.title = env.data.entry.title;
    env.res.tags = env.data.entry.tags;
    env.res.params = env.data.parser_params;
  });
};
