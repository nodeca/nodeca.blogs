// Update blog comment
//
'use strict';


const $ = require('nodeca.core/lib/parser/cheequery');

// If same user edits the same post within 5 minutes, all changes
// made within that period will be squashed into one diff.
const HISTORY_GRACE_PERIOD = 5 * 60 * 1000;


module.exports = function (N, apiPath) {

  N.validate(apiPath, {
    comment_id:               { format: 'mongo', required: true },
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


  // Fetch comment data and check permissions
  //
  N.wire.before(apiPath, function fetch_comment_data(env) {
    return N.wire.emit('server:blogs.entry.comment.edit.index', env);
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
      attachments: env.params.attach,
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
    let tail        = env.data.parse_result.tail.length;

    if (images + attachments + tail > max_images) {
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

    comment.attach       = env.params.attach;
    comment.params       = env.data.parse_options;
    comment.imports      = env.data.parse_result.imports;
    comment.import_users = env.data.parse_result.import_users;
    comment.tail         = env.data.parse_result.tail;

    env.data.new_comment = await comment.save();
  });


  // Save old version in history
  //
  N.wire.after(apiPath, async function save_comment_history(env) {
    let orig_comment = env.data.comment;
    let new_comment  = env.data.new_comment;

    let last_record = await N.models.blogs.BlogCommentHistory.findOne()
                                .where('comment').equals(orig_comment._id)
                                .sort('-_id')
                                .lean(true);

    let last_update_time = last_record ? last_record.ts   : orig_comment.ts;
    let last_update_user = last_record ? last_record.user : orig_comment.user;
    let now = new Date();

    // if the same user edits the same post within grace period, history won't be changed
    if (!(last_update_time > now - HISTORY_GRACE_PERIOD &&
          last_update_time < now &&
          String(last_update_user) === String(env.user_info.user_id))) {

      /* eslint-disable no-undefined */
      last_record = await new N.models.blogs.BlogCommentHistory({
        comment:     orig_comment._id,
        user:        env.user_info.user_id,
        md:          orig_comment.md,
        tail:        orig_comment.tail,
        //title:       orig_comment.title,
        params_ref:  orig_comment.params_ref,
        ip:          env.req.ip
      }).save();
    }

    // if the next history entry would be the same as the last one
    // (e.g. user saves post without changes or reverts change within 5 min),
    // remove redundant history entry
    if (last_record) {
      let last_comment_str = JSON.stringify({
        comment:    last_record.comment,
        user:       last_record.user,
        md:         last_record.md,
        tail:       last_record.tail,
        //title:      last_record.title,
        params_ref: last_record.params_ref
      });

      let next_comment_str = JSON.stringify({
        comment:    new_comment._id,
        user:       env.user_info.user_id,
        md:         new_comment.md,
        tail:       new_comment.tail,
        //title:      new_comment.title,
        params_ref: new_comment.params_ref
      });

      if (last_comment_str === next_comment_str) {
        await N.models.blogs.BlogCommentHistory.remove({ _id: last_record._id });
      }
    }

    await N.models.blogs.BlogComment.update(
      { _id: orig_comment._id },
      { $set: {
        last_edit_ts: new Date(),
        edit_count: await N.models.blogs.BlogCommentHistory.count({ comment: orig_comment._id })
      } }
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
