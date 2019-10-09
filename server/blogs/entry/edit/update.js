// Update blog entry
//
'use strict';


const _              = require('lodash');
const $              = require('nodeca.core/lib/parser/cheequery');
const charcount      = require('charcount');
const create_preview = require('nodeca.blogs/lib/create_preview');


module.exports = function (N, apiPath) {

  N.validate(apiPath, {
    entry_id:                 { format: 'mongo', required: true },
    title:                    { type: 'string', required: true },
    txt:                      { type: 'string', required: true },
    tags:                     {
      type: 'array',
      required: true,
      items: { type: 'string', required: true }
    },
    option_no_mlinks:         { type: 'boolean', required: true },
    option_no_emojis:         { type: 'boolean', required: true },
    option_no_quote_collapse: { type: 'boolean', required: true }
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


  // Fetch entry data and check permissions
  //
  N.wire.before(apiPath, function fetch_entry_data(env) {
    return N.wire.emit('server:blogs.entry.edit.index', env);
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


  // Update entry
  //
  N.wire.after(apiPath, async function update_entry(env) {
    // save it using model to trigger 'post' hooks (e.g. param_ref update)
    let entry = await N.models.blogs.BlogEntry.findById(env.data.entry._id)
                          .lean(false);

    if (!entry) throw N.io.NOT_FOUND;

    entry.title      = env.params.title.trim();
    entry.md         = env.params.txt;
    entry.html       = create_preview(env.data.parse_result.html);
    entry.tags       = env.data.tags;
    entry.tag_hids   = env.data.tag_hids;

    entry.params       = env.data.parse_options;
    entry.imports      = env.data.parse_result.imports;
    entry.import_users = env.data.parse_result.import_users;

    env.data.new_entry = await entry.save();
  });


  // Save old version in history
  //
  N.wire.after(apiPath, function save_history(env) {
    return N.models.blogs.BlogEntryHistory.add(
      {
        old_entry:  env.data.entry,
        new_entry:  env.data.new_entry
      },
      {
        user: env.user_info.user_id,
        role: N.models.blogs.BlogEntryHistory.roles.USER,
        ip:   env.req.ip
      }
    );
  });


  // Remove unused tags
  //
  N.wire.after(apiPath, async function remove_tags(env) {
    let orig_entry = env.data.entry;
    let new_entry  = env.data.new_entry;
    let tags = new Set();

    for (let hid of orig_entry.tag_hids || []) tags.add(hid);
    for (let hid of new_entry.tag_hids  || []) tags.delete(hid);

    // check each tag that was present in the original entry,
    // and isn't present anymore after changes
    for (let hid of tags) {
      let entry = await N.models.blogs.BlogEntry.findOne()
                            .where('tag_hids').equals(hid)
                            .lean(true);

      if (!entry) {
        await N.models.blogs.BlogTag.deleteOne({ hid });
      }
    }
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


  // Mark user as active
  //
  N.wire.after(apiPath, function set_active_flag(env) {
    return N.wire.emit('internal:users.mark_user_active', env);
  });
};
