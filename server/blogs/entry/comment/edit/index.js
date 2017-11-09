// Get comment source
//
'use strict';


module.exports = function (N, apiPath) {

  N.validate(apiPath, {
    comment_id: { format: 'mongo', required: true }
  });


  // Check auth
  //
  N.wire.before(apiPath, function check_user_auth(env) {
    if (!env.user_info.is_member) throw N.io.FORBIDDEN;
  });


  // Fetch comment
  //
  N.wire.before(apiPath, async function fetch_comment(env) {
    env.data.comment = await N.models.blogs.BlogComment
                                 .findById(env.params.comment_id)
                                 .lean(true);

    if (!env.data.comment) throw N.io.NOT_FOUND;
  });


  // Fetch entry
  //
  N.wire.before(apiPath, async function fetch_entry(env) {
    env.data.entry = await N.models.blogs.BlogEntry
                               .findById(env.data.comment.entry)
                               .lean(true);

    if (!env.data.entry) throw N.io.NOT_FOUND;
  });


  // Check if user can see this comment
  //
  N.wire.before(apiPath, async function check_access(env) {
    let access_env = { params: {
      comments:  env.data.comment,
      user_info: env.user_info,
      preload:   [ env.data.entry ]
    } };

    await N.wire.emit('internal:blogs.access.comment', access_env);

    if (!access_env.data.access_read) throw N.io.NOT_FOUND;
  });


  // Check permissions
  //
  N.wire.before(apiPath, async function check_permissions(env) {
    let can_create = await env.extras.settings.fetch('blogs_can_create');

    if (!can_create) throw N.io.FORBIDDEN;

    if (String(env.user_info.user_id) !== String(env.data.comment.user)) {
      throw N.io.FORBIDDEN;
    }

    let blogs_edit_comments_max_time = await env.extras.settings.fetch('blogs_edit_comments_max_time');

    if (blogs_edit_comments_max_time !== 0 &&
        env.data.comment.ts < Date.now() - blogs_edit_comments_max_time * 60 * 1000) {
      throw {
        code: N.io.CLIENT_ERROR,
        message: env.t('@blogs.entry.comment.edit.err_perm_expired')
      };
    }
  });


  // Fetch parser params
  //
  N.wire.before(apiPath, async function fetch_parser_params(env) {
    env.data.parser_params = await N.models.core.MessageParams.getParams(env.data.comment.params_ref);
  });


  // Fetch attachments info
  //
  N.wire.before(apiPath, async function fetch_attachments(env) {
    if (!env.data.comment.attach || !env.data.comment.attach.length) {
      env.data.attachments = [];
      return;
    }

    let attachments = await N.models.users.MediaInfo.find()
                                .where('media_id').in(env.data.comment.attach)
                                .select('media_id file_name type')
                                .lean(true);

    // Sort in the same order as it was in post
    env.data.attachments = env.data.comment.attach.reduce((acc, media_id) => {
      let attach = attachments.find(attachment => String(attachment.media_id) === String(media_id));

      if (attach) {
        acc.push(attach);
      }
      return acc;
    }, []);
  });


  // Fill entry data
  //
  N.wire.on(apiPath, function fill_data(env) {
    env.data.users = env.data.users || [];

    if (env.data.comment.user)   env.data.users.push(env.data.comment.user);
    if (env.data.comment.del_by) env.data.users.push(env.data.comment.del_by);

    if (env.data.comment.import_users) {
      env.data.users = env.data.users.concat(env.data.comment.import_users);
    }

    env.res.user_id = env.data.comment.user;
    env.res.md = env.data.comment.md;
    env.res.attachments = env.data.attachments;
    env.res.params = env.data.parser_params;
  });
};
