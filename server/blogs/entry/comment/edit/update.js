// Update blog comment
//
'use strict';


const $ = require('nodeca.core/lib/parser/cheequery');


module.exports = function (N, apiPath) {

  N.validate(apiPath, {
    comment_id:               { format: 'mongo', required: true },
    txt:                      { type: 'string', required: true },
    option_no_mlinks:         { type: 'boolean', required: true },
    option_no_emojis:         { type: 'boolean', required: true },
    option_no_quote_collapse: { type: 'boolean', required: true }
  });


  // Fetch comment data and check permissions
  //
  N.wire.before(apiPath, function fetch_comment_data(env) {
    return N.wire.emit('server:blogs.entry.comment.edit.index', env);
  });


  // Prepare parse options
  //
  N.wire.before(apiPath, async function prepare_options(env) {
    let settings = await N.settings.getByCategory(
      'blog_comments_markup',
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
      options: env.data.parse_options,
      user_info: env.user_info
    });
  });


  // Check post length
  //
  N.wire.after(apiPath, async function check_post_length(env) {
    let min_length = await env.extras.settings.fetch('blog_comment_min_length');

    if (env.data.parse_result.text_length < min_length) {
      throw {
        code: N.io.CLIENT_ERROR,
        message: env.t('err_text_too_short', min_length)
      };
    }
  });


  // Limit an amount of images in the post
  //
  N.wire.after(apiPath, async function check_images_count(env) {
    let max_images = await env.extras.settings.fetch('blog_comment_max_images');

    if (max_images <= 0) return;

    let ast         = $.parse(env.data.parse_result.html);
    let images      = ast.find('.image').length;
    let attachments = ast.find('.attach').length;

    if (images + attachments > max_images) {
      throw {
        code: N.io.CLIENT_ERROR,
        message: env.t('err_too_many_images', max_images)
      };
    }
  });


  // Limit an amount of emoticons in the post
  //
  N.wire.after(apiPath, async function check_emoji_count(env) {
    let max_emojis = await env.extras.settings.fetch('blog_comment_max_emojis');

    if (max_emojis < 0) return;

    if ($.parse(env.data.parse_result.html).find('.emoji').length > max_emojis) {
      throw {
        code: N.io.CLIENT_ERROR,
        message: env.t('err_too_many_emojis', max_emojis)
      };
    }
  });


  // Update comment
  //
  N.wire.after(apiPath, async function update_comment(env) {
    // save it using model to trigger 'post' hooks (e.g. param_ref update)
    let comment = await N.models.blogs.BlogComment.findById(env.data.comment._id)
                          .lean(false);

    if (!comment) throw N.io.NOT_FOUND;

    comment.md         = env.params.txt;
    comment.html       = env.data.parse_result.html;

    comment.params       = env.data.parse_options;
    comment.imports      = env.data.parse_result.imports;
    comment.import_users = env.data.parse_result.import_users;

    env.data.new_comment = await comment.save();
  });


  // Save old version in history
  //
  N.wire.after(apiPath, function save_history(env) {
    return N.models.blogs.BlogCommentHistory.add(
      {
        old_comment:  env.data.comment,
        new_comment:  env.data.new_comment
      },
      {
        user: env.user_info.user_id,
        role: N.models.blogs.BlogCommentHistory.roles.USER,
        ip:   env.req.ip
      }
    );
  });


  // Schedule image size fetch
  //
  N.wire.after(apiPath, function fill_image_info(env) {
    return N.queue.blog_comment_images_fetch(env.data.new_comment._id).postpone();
  });


  // Schedule search index update
  //
  N.wire.after(apiPath, async function add_search_index(env) {
    await N.queue.blog_comments_search_update_by_ids([ env.data.new_comment._id ]).postpone();
  });


  // Mark user as active
  //
  N.wire.after(apiPath, function set_active_flag(env) {
    return N.wire.emit('internal:users.mark_user_active', env);
  });
};
