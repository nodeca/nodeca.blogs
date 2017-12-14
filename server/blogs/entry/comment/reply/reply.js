// Reply to a blog entry or blog comment
//
'use strict';


const $ = require('nodeca.core/lib/parser/cheequery');


module.exports = function (N, apiPath) {

  N.validate(apiPath, {
    entry_hid:                { type: 'integer', required: true },
    parent_comment_id:        { format: 'mongo' },
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


  // Fetch entry info
  //
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

    // Check 'can_see_deleted_users' permission
    if (!can_see_deleted_users) {
      query.where({ exists: true });
    }

    env.data.user = await query.exec();

    if (!env.data.user) throw N.io.NOT_FOUND;
  });


  // Fetch parent comment (if any)
  //
  N.wire.before(apiPath, async function fetch_parent_comment(env) {
    if (!env.params.parent_comment_id) return;

    let comment = await N.models.blogs.BlogComment.findById(env.params.parent_comment_id).lean(true);

    if (!comment) {
      throw {
        code: N.io.CLIENT_ERROR,
        message: env.t('error_invalid_parent_post')
      };
    }

    env.data.parent_comment = comment;

    let access_env = { params: {
      comments:  env.data.parent_comment,
      user_info: env.user_info,
      preload:   [ env.data.entry ]
    } };

    await N.wire.emit('internal:blogs.access.comment', access_env);

    if (!access_env.data.access_read) {
      throw {
        code: N.io.CLIENT_ERROR,
        message: env.t('error_invalid_parent_post')
      };
    }
  });


  // Check ignores, forbid posting if:
  //  - blog owner is ignoring you
  //  - you're ignoring blog owner
  //  - replying to comment, its author is ignoring you
  //  - replying to comment, you're ignoring its author
  //
  N.wire.before(apiPath, async function check_ignores(env) {
    let ignore_data;

    // Blog owner is ignoring us (except for moderators)
    //
    ignore_data = await N.models.users.Ignore.findOne()
                            .where('from').equals(env.data.user._id)
                            .where('to').equals(env.user_info.user_id)
                            .lean(true);

    if (ignore_data) {
      let cannot_be_ignored = await env.extras.settings.fetch('cannot_be_ignored');

      if (!cannot_be_ignored) {
        throw {
          code: N.io.CLIENT_ERROR,
          message: env.t('err_blog_sender_is_ignored')
        };
      }
    }

    // We're ignoring blog owner
    //
    ignore_data = await N.models.users.Ignore.findOne()
                            .where('to').equals(env.data.user._id)
                            .where('from').equals(env.user_info.user_id)
                            .lean(true);

    if (ignore_data) {
      throw {
        code: N.io.CLIENT_ERROR,
        message: env.t('err_blog_recipient_is_ignored')
      };
    }

    // Replying to a comment, its author is ignoring us (except for moderators)
    //
    if (env.data.parent_comment && env.data.parent_comment.user) {
      ignore_data = await N.models.users.Ignore.findOne()
                              .where('from').equals(env.data.parent_comment.user)
                              .where('to').equals(env.user_info.user_id)
                              .lean(true);

      if (ignore_data) {
        let cannot_be_ignored = await env.extras.settings.fetch('cannot_be_ignored');

        if (!cannot_be_ignored) {
          throw {
            code: N.io.CLIENT_ERROR,
            message: env.t('err_comment_sender_is_ignored')
          };
        }
      }
    }

    // Replying to a comment, we're ignoring its author
    //
    if (env.data.parent_comment) {
      ignore_data = await N.models.users.Ignore.findOne()
                              .where('to').equals(env.data.parent_comment.user)
                              .where('from').equals(env.user_info.user_id)
                              .lean(true);

      if (ignore_data) {
        throw {
          code: N.io.CLIENT_ERROR,
          message: env.t('err_comment_recipient_is_ignored')
        };
      }
    }
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


  // Save new comment
  //
  N.wire.after(apiPath, async function save_new_comment(env) {
    let comment = new N.models.blogs.BlogComment();

    env.data.new_comment = comment;

    comment.user  = env.user_info.user_id;
    comment.entry = env.data.entry;
    comment.md    = env.params.txt;
    comment.html  = env.data.parse_result.html;
    comment.ip    = env.req.ip;
    comment.ts    = Date.now();

    comment.path  = env.data.parent_comment ?
                    env.data.parent_comment.path.concat([ env.data.parent_comment._id ]) :
                    [];

    comment.attach       = env.params.attach;
    comment.params       = env.data.parse_options;
    comment.imports      = env.data.parse_result.imports;
    comment.import_users = env.data.parse_result.import_users;
    comment.tail         = env.data.parse_result.tail;

    if (env.user_info.hb) {
      comment.st  = N.models.blogs.BlogComment.statuses.HB;
      comment.ste = N.models.blogs.BlogComment.statuses.VISIBLE;
    } else {
      comment.st  = N.models.blogs.BlogComment.statuses.VISIBLE;
    }

    await comment.save();

    env.res.comment_hid = comment.hid;
  });


  // Schedule image size fetch
  //
  N.wire.after(apiPath, function fill_image_info(env) {
    return N.queue.blog_comment_images_fetch(env.data.new_comment._id).postpone();
  });


  // Update comment counters
  //
  N.wire.after(apiPath, function update_counters(env) {
    return N.models.blogs.BlogEntry.updateCounters(env.data.entry._id);
  });


  // Schedule search index update
  //
  N.wire.after(apiPath, async function add_search_index(env) {
    await N.queue.blog_entries_search_update_by_ids([ env.data.entry._id ]).postpone();
    await N.queue.blog_comments_search_update_by_ids([ env.data.new_comment._id ]).postpone();
  });


  // TODO: add notification for user whose post was replied to
  // TODO: add notification for subscribers


  // Mark user as active
  //
  N.wire.after(apiPath, function set_active_flag(env) {
    return N.wire.emit('internal:users.mark_user_active', env);
  });
};
