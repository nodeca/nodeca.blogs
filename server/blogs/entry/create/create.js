// Create new blog entry
//
'use strict';


const _         = require('lodash');
const $         = require('nodeca.core/lib/parser/cheequery');
const charcount = require('charcount');


module.exports = function (N, apiPath) {

  N.validate(apiPath, {
    title:                    { type: 'string', required: true },
    txt:                      { type: 'string', required: true },
    tags:                     {
      type: 'array',
      required: true,
      items: { type: 'string', required: true }
    },
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


  // Check title length
  //
  N.wire.before(apiPath, async function check_title_length(env) {
    let min_length = await env.extras.settings.fetch('blog_entry_title_min_length');

    if (charcount(env.params.title.trim()) < min_length) {
      throw {
        code: N.io.CLIENT_ERROR,
        message: env.t('err_title_too_short', min_length)
      };
    }
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


  // Prepare parse options
  //
  N.wire.before(apiPath, async function prepare_options(env) {
    let settings = await N.settings.getByCategory(
      'blog_entries_markup',
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
    let min_length = await env.extras.settings.fetch('blog_entry_min_length');

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
    let max_images = await env.extras.settings.fetch('blog_entry_max_images');

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
    let max_emojis = await env.extras.settings.fetch('blog_entry_max_emojis');

    if (max_emojis < 0) return;

    if ($.parse(env.data.parse_result.html).find('.emoji').length > max_emojis) {
      throw {
        code: N.io.CLIENT_ERROR,
        message: env.t('err_too_many_emojis', max_emojis)
      };
    }
  });


  // Save tags
  //
  N.wire.after(apiPath, async function save_tags(env) {
    let store = N.settings.getStore('user');
    let { value } = await store.get('blogs_categories', { user_id: env.user_info.user_id });
    let categories;

    try {
      categories = JSON.parse(value);
    } catch (__) {
      categories = [];
    }

    categories = categories.map(N.models.blogs.BlogTag.normalize);

    let tags = _.uniqBy(env.params.tags, N.models.blogs.BlogTag.normalize);

    let tags_by_name = _.keyBy(
      await N.models.blogs.BlogTag.find()
                .where('user').equals(env.user_info.user_id)
                .where('name_lc').in(tags.map(N.models.blogs.BlogTag.normalize))
                .lean(true),
      'name_lc'
    );

    for (let tag of tags) {
      tag = N.models.blogs.BlogTag.normalize(tag);

      if (tags_by_name[tag]) continue;

      // create all tags that don't already exist
      let new_tag = await N.models.blogs.BlogTag.create({
        name_lc: tag,
        user: env.user_info.user_id,
        is_category: categories.indexOf(tag) !== -1
      });

      tags_by_name[tag] = new_tag;
    }

    env.data.tags = tags;
    env.data.tag_hids = tags.map(tag => tags_by_name[N.models.blogs.BlogTag.normalize(tag)].hid);
  });


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
    entry.tags       = env.data.tags;
    entry.tag_hids   = env.data.tag_hids;
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


  // Schedule image size fetch
  //
  N.wire.after(apiPath, function fill_image_info(env) {
    return N.queue.blog_entry_images_fetch(env.data.new_entry._id).postpone();
  });


  // Schedule search index update
  //
  N.wire.after(apiPath, async function add_search_index(env) {
    await N.queue.blog_entries_search_update_by_ids([ env.data.new_entry._id ]).postpone();
  });


  // TODO: add notification for subscribers


  // Mark user as active
  //
  N.wire.after(apiPath, function set_active_flag(env) {
    return N.wire.emit('internal:users.mark_user_active', env);
  });
};
