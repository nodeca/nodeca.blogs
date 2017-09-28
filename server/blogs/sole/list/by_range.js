// Get a specified amount of entries before or after entry with given _id
//
'use strict';


const _  = require('lodash');

const LIMIT = 50; // max entries to fetch before and after


module.exports = function (N, apiPath) {

  N.validate(apiPath, {
    user_hid: { type: 'integer', minimum: 1, required: true },
    tag_hid:  { type: 'integer', required: true }, // could be 0 (no tag)
    start:    { format: 'mongo', required: true },
    before:   { type: 'integer', minimum: 0, maximum: LIMIT, required: true },
    after:    { type: 'integer', minimum: 0, maximum: LIMIT, required: true }
  });


  let build_entry_ids = require('./_build_entry_ids_by_range')(N);


  // Get blog owner
  //
  N.wire.before(apiPath, function fetch_user_by_hid(env) {
    return N.wire.emit('internal:users.fetch_user_by_hid', env);
  });


  // Forbid access to pages owned by bots
  //
  N.wire.before(apiPath, async function bot_member_pages_forbid_access(env) {
    let is_bot = await N.settings.get('is_bot', {
      user_id: env.data.user._id,
      usergroup_ids: env.data.user.usergroups
    }, {});

    if (is_bot) throw N.io.NOT_FOUND;
  });


  // Fetch current tag
  //
  N.wire.before(apiPath, async function fetch_current_tag(env) {
    if (env.params.tag_hid) {
      env.data.current_tag = await N.models.blogs.BlogTag.findOne()
                                       .where('hid').in(env.params.tag_hid)
                                       .where('user').in(env.data.user._id)
                                       .lean(true);

      if (!env.data.current_tag) {
        // This can only happen if tag existed when a page was loaded,
        // but deleted before prefetch occured. No more results would be
        // shown in this case.
        env.data.current_tag = { hid: 0 };
      }
    }
  });


  // Subcall blogs.entry_list
  //
  N.wire.on(apiPath, function subcall_entry_list(env) {
    env.data.select_start    = env.params.start;
    env.data.select_before   = env.params.before;
    env.data.select_after    = env.params.after;
    env.data.build_entry_ids = build_entry_ids;

    return N.wire.emit('internal:blogs.entry_list', env);
  });


  // Fetch tags for all entries
  //
  N.wire.after(apiPath, async function fetch_tags(env) {
    let tagset = new Set();

    for (let entry of env.data.entries) {
      for (let hid of entry.tag_hids || []) {
        tagset.add(hid);
      }
    }

    let tags = await N.models.blogs.BlogTag.find()
                         .where('hid').in(Array.from(tagset.values()))
                         .limit(20)
                         .lean(true);

    env.res.tags = _.keyBy(tags.concat(env.data.categories).map(tag => _.pick(tag, [
      '_id', 'hid', 'user', 'name', 'is_category'
    ])), 'hid');
  });


  // Fill 'prev' and 'next' links and meta tags
  //
  N.wire.after(apiPath, async function fill_prev_next(env) {
    env.res.head = env.res.head || {};

    //
    // Fetch entry after last one, turn it into a link to the next page
    //
    if (env.params.after > 0 && env.data.entries.length > 0) {
      let last_entry_id = env.data.entries[0]._id;

      let query = N.models.blogs.BlogEntry.findOne();

      if (env.data.current_tag) {
        query = query.where('tag_hids').equals(env.data.current_tag.hid);
      }

      let entry = await query
                          .where('user').equals(env.data.user._id)
                          .where('_id').lt(last_entry_id)
                          .where('st').in(env.data.blog_entries_visible_statuses)
                          .select('_id')
                          .sort('-_id')
                          .lean(true);

      // `entry` is only used to check if there is a post afterwards
      if (entry) {
        env.res.head.next = N.router.linkTo('blogs.index', {
          $query: {
            from: String(env.data.entries[env.data.entries.length - 1].hid),
            next: ''
          }
        });
      }
    }

    //
    // Fetch entry before first one, turn it into a link to the previous page
    //
    if (env.params.before > 0 && env.data.entries.length > 0) {
      let last_entry_id = env.data.entries[0]._id;

      let query = N.models.blogs.BlogEntry.findOne();

      if (env.data.current_tag) {
        query = query.where('tag_hids').equals(env.data.current_tag.hid);
      }

      let entry = await query
                          .where('user').equals(env.data.user._id)
                          .where('_id').gt(last_entry_id)
                          .where('st').in(env.data.blog_entries_visible_statuses)
                          .select('_id')
                          .sort('_id')
                          .lean(true);

      // `entry` is only used to check if there is a post afterwards
      if (entry) {
        env.res.head.prev = N.router.linkTo('blogs.index', {
          $query: {
            from: String(env.data.entries[0].hid),
            prev: ''
          }
        });
      }
    }
  });


  // Fill pagination (progress)
  //
  N.wire.after(apiPath, async function fill_pagination(env) {
    //
    // Count total amount of visible blog entries
    //
    let counters_by_status = await Promise.all(
      env.data.blog_entries_visible_statuses.map(st => {
        let query = N.models.blogs.BlogEntry
                        .where('st').equals(st)
                        .where('user').equals(env.data.user._id);

        if (env.data.current_tag) {
          query = query.where('tag_hids').equals(env.data.current_tag.hid);
        }

        return query.count();
      })
    );

    let total = _.sum(counters_by_status);

    //
    // Count an amount of visible blog entries before the first displayed
    //
    let offset = 0;

    if (env.data.entries.length) {
      let counters_by_status = await Promise.all(
        env.data.blog_entries_visible_statuses.map(st => {
          let query = N.models.blogs.BlogEntry
                          .where('st').equals(st)
                          .where('user').equals(env.data.user._id)
                          .where('_id').gt(env.data.entries[0]._id);

          if (env.data.current_tag) {
            query = query.where('tag_hids').equals(env.data.current_tag.hid);
          }

          return query.count();
        })
      );

      offset = _.sum(counters_by_status);
    }

    env.res.pagination = {
      total,
      per_page:     await env.extras.settings.fetch('blog_entries_per_page'),
      chunk_offset: offset
    };
  });
};
