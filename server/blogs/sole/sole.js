// List of blog entries created by a user
//

'use strict';


const _       = require('lodash');
const Promise = require('bluebird');


module.exports = function (N, apiPath) {

  N.validate(apiPath, {
    user_hid: { type: 'integer', minimum: 1, required: true },
    $query: {
      type: 'object',
      properties: {
        tag:  { type: 'string' }, // tag hid
        from: { type: 'string' },
        prev: { 'enum': [ '' ] },
        next: { 'enum': [ '' ] }
      },
      additionalProperties: false
    }
  });


  let build_entry_ids_by_range = require('./list/_build_entry_ids_by_range')(N);

  async function build_entry_ids(env) {
    let prev = false, next = false, start = null;

    if (env.params.$query) {
      let query = env.params.$query;

      prev = typeof query.prev !== 'undefined';
      next = typeof query.next !== 'undefined';

      // get hid by id
      if (query.from && _.isInteger(+query.from)) {
        let q = N.models.blogs.BlogEntry.findOne();

        if (env.data.current_tag) {
          q = q.where('tag_hids').equals(env.data.current_tag.hid);
        }

        let entry = await q.where('user').equals(env.data.user._id)
                           .where('hid').equals(+query.from)
                           .where('st').in(env.data.blog_entries_visible_statuses)
                           .select('_id')
                           .lean(true);

        if (entry) start = entry._id;
      }
    }

    let limit_direction = prev || next;

    env.data.select_start  = start;
    env.data.select_before = (!limit_direction || prev) ? env.data.entries_per_page : 0;
    env.data.select_after  = (!limit_direction || next) ? env.data.entries_per_page : 0;

    return build_entry_ids_by_range(env);
  }


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


  // Fetch all categories for this user
  //
  N.wire.before(apiPath, async function fetch_categories(env) {
    let categories = await N.models.blogs.BlogTag.find()
                               .where('user').in(env.data.user._id)
                               .where('is_category').equals(true)
                               .sort('hid')
                               .lean(true);

    env.data.categories = categories;

    env.res.category_hids = _.map(env.data.categories, 'hid');
  });


  // Fetch current tag
  //
  N.wire.before(apiPath, async function fetch_current_tag(env) {
    env.data.current_tag = null;

    if (env.params.$query && env.params.$query.tag && _.isInteger(+env.params.$query.tag)) {
      env.data.current_tag = await N.models.blogs.BlogTag.findOne()
                                       .where('hid').in(+env.params.$query.tag)
                                       .where('user').in(env.data.user._id)
                                       .lean(true);
    }

    env.res.current_tag = env.data.current_tag && env.data.current_tag.hid || 0;
  });


  // Subcall blogs.entry_list
  //
  N.wire.on(apiPath, async function subcall_entry_list(env) {
    env.data.build_entry_ids  = build_entry_ids;
    env.data.entries_per_page = await env.extras.settings.fetch('blog_entries_per_page');

    await N.wire.emit('internal:blogs.entry_list', env);

    env.data.users = env.data.users || [];
    env.data.users.push(env.data.user._id);

    env.res.user_id = env.data.user._id;
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


  // Fill pagination (progress)
  //
  N.wire.after(apiPath, async function fill_pagination(env) {
    //
    // Count total amount of visible blog entries
    //
    let counters_by_status = await Promise.map(
      env.data.blog_entries_visible_statuses,
      st => {
        let query = N.models.blogs.BlogEntry
                        .where('st').equals(st)
                        .where('user').equals(env.data.user._id);

        if (env.data.current_tag) {
          query = query.where('tag_hids').equals(env.data.current_tag.hid);
        }

        return query.count();
      }
    );

    let total = _.sum(counters_by_status);

    //
    // Count an amount of visible blog entries before the first displayed
    //
    let offset = 0;

    if (env.data.entries.length) {
      let counters_by_status = await Promise.map(
        env.data.blog_entries_visible_statuses,
        st => {
          let query = N.models.blogs.BlogEntry
                          .where('st').equals(st)
                          .where('user').equals(env.data.user._id)
                          .where('_id').gt(env.data.entries[0]._id);

          if (env.data.current_tag) {
            query = query.where('tag_hids').equals(env.data.current_tag.hid);
          }

          return query.count();
        }
      );

      offset = _.sum(counters_by_status);
    }

    env.res.pagination = {
      total,
      per_page:     await env.extras.settings.fetch('blog_entries_per_page'),
      chunk_offset: offset
    };
  });


  // Fill head meta
  //
  N.wire.after(apiPath, function fill_head(env) {
    let user = env.data.user;

    env.res.head = env.res.head || {};
    env.res.head.title = env.t('title_with_user', { user: env.user_info.is_member ? user.name : user.nick });

    if (env.params.$query && env.params.$query.from) {
      env.res.head.robots = 'noindex,follow';
    }
  });


  // Fill breadcrumbs
  //
  N.wire.after(apiPath, function fill_breadcrumbs(env) {
    let user = env.data.user;

    env.data.breadcrumbs = [];

    env.data.breadcrumbs.push({
      text:  env.t('@common.menus.navbar.blogs'),
      route: 'blogs.index'
    });

    env.data.breadcrumbs.push({
      //text:    env.user_info.is_member ? user.name : user.nick,
      text:    user.nick,
      route:   'blogs.sole',
      params:  { user_hid: user.hid }
    });

    if (env.data.current_tag) {
      env.data.breadcrumbs.push({
        text: env.data.current_tag.name
      });
    }

    env.res.breadcrumbs = env.data.breadcrumbs;
  });


  // Fill 'prev' and 'next' links and meta tags
  //
  N.wire.after(apiPath, async function fill_prev_next(env) {
    env.res.head = env.res.head || {};

    //
    // Fetch entry after last one, turn it into a link to the next page
    //
    if (env.data.entries.length > 0) {
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
    if (env.data.entries.length > 0) {
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

    //
    // Fetch last entry for the "move to bottom" button
    //
    if (env.data.entries.length > 0) {
      let query = N.models.blogs.BlogEntry.findOne();

      if (env.data.current_tag) {
        query = query.where('tag_hids').equals(env.data.current_tag.hid);
      }

      let entry = await query
                          .where('user').equals(env.data.user._id)
                          .where('st').in(env.data.blog_entries_visible_statuses)
                          .select('hid -_id')
                          .sort('_id')
                          .lean(true);

      if (entry) {
        env.res.last_entry_hid = entry.hid;
      }
    }
  });
};
