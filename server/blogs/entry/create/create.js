// Create new blog entry
//
'use strict';


module.exports = function (N, apiPath) {

  N.validate(apiPath, {
    title:                    { type: 'string', required: true },
    txt:                      { type: 'string', required: true },
    attach:                   {
      type: 'array',
      required: true,
      uniqueItems: true,
      items: { format: 'mongo', required: true }
    },
    option_no_mlinks:         { type: 'boolean', required: true },
    option_no_emojis:         { type: 'boolean', required: true },
    option_no_quote_collapse: { type: 'boolean', required: true }
  });


  // Check auth
  //
  N.wire.before(apiPath, function check_user_auth(env) {
    if (!env.user_info.is_member) throw N.io.FORBIDDEN;
  });


  // TODO: check title length


  // Check permissions
  //
  N.wire.before(apiPath, async function check_permissions(env) {
    let can_create = await env.extras.settings.fetch('blogs_can_create');

    if (!can_create) throw N.io.FORBIDDEN;
  });


  // Check attachments owner
  //
  N.wire.before(apiPath, function attachments_check_owner(env) {
    return N.wire.emit('internal:users.attachments_check_owner', env);
  });


  // Prepare parse options
  //
  N.wire.before(apiPath, async function prepare_options(env) {
    let settings = await N.settings.getByCategory(
      'blog_entries',
      { usergroup_ids: env.user_info.usergroups },
      { alias: true });

    if (env.params.option_no_mlinks) {
      settings.link_to_title = false;
      settings.link_to_snippet = false;
    }

    if (env.params.option_no_emojis) {
      settings.emoji = false;
    }

    if (env.params.option_no_quote_collapse) {
      settings.quote_collapse = false;
    }

    env.data.parse_options = settings;
  });


  // Parse user input to HTML
  //
  N.wire.on(apiPath, async function parse_text(env) {
    env.data.parse_result = await N.parser.md2html({
      text: env.params.txt,
      attachments: env.params.attach,
      options: env.data.parse_options,
      user_info: env.user_info
    });
  });


  // TODO: check entry length
  // TODO: check image count
  // TODO: check emoticons count

  // Create new entry
  //
  N.wire.after(apiPath, async function create_entry(env) {
    let entry = new N.models.blogs.BlogEntry();

    env.data.new_entry = entry;

    entry.title      = env.params.title.trim();
    entry.user       = env.user_info.user_id;
    entry.md         = env.params.txt;
    entry.html       = env.data.parse_result.html;
    entry.ip         = env.req.ip;
    entry.tag_hids   = []; // TODO
    entry.tag_source = ''; // TODO
    entry.ts         = Date.now();

    entry.attach       = env.params.attach;
    entry.params       = env.data.parse_options;
    entry.imports      = env.data.parse_result.imports;
    entry.import_users = env.data.parse_result.import_users;
    entry.tail         = env.data.parse_result.tail;

    if (env.user_info.hb) {
      entry.st  = N.models.blogs.BlogEntry.statuses.HB;
      entry.ste = N.models.blogs.BlogEntry.statuses.VISIBLE;
    } else {
      entry.st  = N.models.blogs.BlogEntry.statuses.VISIBLE;
    }

    await entry.save();

    env.res.entry_hid = entry.hid;
  });


  // TODO: schedule image size fetch
  // TODO: schedule search index update
  // TODO: add notification for subscribers


  // Mark user as active
  //
  N.wire.after(apiPath, function set_active_flag(env) {
    return N.wire.emit('internal:users.mark_user_active', env);
  });
};
