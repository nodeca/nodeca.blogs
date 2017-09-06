// Send abuse report
//
'use strict';


module.exports = function (N, apiPath) {

  N.validate(apiPath, {
    entry_id: { format: 'mongo', required: true },
    message:  { type: 'string', required: true }
  });


  // Check auth
  //
  N.wire.before(apiPath, function check_auth(env) {
    if (!env.user_info.is_member) throw N.io.FORBIDDEN;
  });


  // Check permissions
  //
  N.wire.before(apiPath, async function check_permissions(env) {
    let can_report_abuse = await env.extras.settings.fetch('can_report_abuse');

    if (!can_report_abuse) throw N.io.FORBIDDEN;
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


  // Send abuse report
  //
  N.wire.on(apiPath, async function send_report_subcall(env) {
    env.data.message = env.params.message;

    let params = await N.models.core.MessageParams.getParams(env.data.entry.params_ref);

    // enable markup used in templates (even if it's disabled in forum)
    params.link  = true;
    params.quote = true;

    let report = new N.models.core.AbuseReport({
      src: env.data.entry._id,
      type: N.shared.content_type.BLOG_ENTRY,
      text: env.params.message,
      from: env.user_info.user_id,
      params_ref: await N.models.core.MessageParams.setParams(params)
    });

    await N.wire.emit('internal:common.abuse_report', { report });
  });


  // Mark user as active
  //
  N.wire.after(apiPath, function set_active_flag(env) {
    return N.wire.emit('internal:users.mark_user_active', env);
  });
};
