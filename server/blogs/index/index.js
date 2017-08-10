// Main blog page (list of blog entries)
//

'use strict';


const _       = require('lodash');
const Promise = require('bluebird');


module.exports = function (N, apiPath) {

  N.validate(apiPath, {
    $query: {
      type: 'object',
      properties: {
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
        let entry = await N.models.blogs.BlogEntry.findOne()
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


  // Subcall blogs.entry_list
  //
  N.wire.on(apiPath, async function subcall_entry_list(env) {
    env.data.build_entry_ids  = build_entry_ids;
    env.data.entries_per_page = await env.extras.settings.fetch('blog_entries_per_page');

    return N.wire.emit('internal:blogs.entry_list', env);
  });


  // Fill pagination (progress)
  //
  N.wire.after(apiPath, async function fill_pagination(env) {
    //
    // Count total amount of visible entries in the section
    //
    let counters_by_status = await Promise.map(
      env.data.blog_entries_visible_statuses,
      st => N.models.blogs.BlogEntry
                .where('st').equals(st)
                .count()
    );

    let total = _.sum(counters_by_status);

    //
    // Count an amount of visible topics before the first one
    //
    let offset = 0;

    if (env.data.entries.length) {
      let counters_by_status = await Promise.map(
        env.data.blog_entries_visible_statuses,
        st => N.models.blogs.BlogEntry
                  .where('st').equals(st)
                  .where('_id').gt(env.data.entries[0]._id)
                  .count()
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
    env.res.head = env.res.head || {};
    env.res.head.title = env.t('title');

    if (env.params.topic_hid) {
      env.res.head.robots = 'noindex,follow';
    }
  });


  // Fill breadcrumbs
  //
  N.wire.after(apiPath, function fill_breadcrumbs(env) {
    env.data.breadcrumbs = [];

    env.data.breadcrumbs.push({
      text: env.t('@common.menus.navbar.blogs'),
      route: 'blogs.index'
    });

    env.data.breadcrumbs.push({
      text: env.t('title')
    });

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
      let last_entry_id = env.data.entries[env.data.entries.length - 1]._id;

      let entry = await N.models.blogs.BlogEntry.findOne()
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

      let entry = await N.models.blogs.BlogEntry.findOne()
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
      let entry = await N.models.blogs.BlogEntry.findOne()
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
