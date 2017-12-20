// Blog entry
//

'use strict';

const _                = require('lodash');
const sanitize_comment = require('nodeca.blogs/lib/sanitizers/blog_comment');
const sanitize_entry   = require('nodeca.blogs/lib/sanitizers/blog_entry');


module.exports = function (N, apiPath) {

  N.validate(apiPath, {
    user_hid:  { type: 'integer', minimum: 1, required: true },
    entry_hid: { type: 'integer', minimum: 1, required: true }
  });


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


  // If user_hid in params is incorrect, redirect to a proper url
  //
  N.wire.before(apiPath, function redirect_to_correct_user(env) {
    if (env.data.user.hid !== env.params.user_hid) {
      throw {
        code: N.io.REDIRECT,
        head: {
          Location: N.router.linkTo('blogs.entry', {
            user_hid:  env.data.user.hid,
            entry_hid: env.params.entry_hid
          })
        }
      };
    }
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


  // Fetch tags
  //
  N.wire.before(apiPath, async function fetch_tags(env) {
    let entry = env.data.entry;

    if (!entry.tag_hids || !entry.tag_hids.length) {
      env.res.entry_tags = [];
      return;
    }

    // db query is only used to check if this tag is a category
    let tags_by_name = _.keyBy(
      await N.models.blogs.BlogTag.find()
                .where('hid').in(entry.tag_hids)
                .lean(true),
      'name_lc'
    );

    let tags = (entry.tags || [])
                 .map((name, idx) => {
                   let name_lc = N.models.blogs.BlogTag.normalize(name);
                   return [ name, tags_by_name[name_lc] && tags_by_name[name_lc].is_category, idx ];
                 })
                 /* eslint-disable no-unused-vars */
                 .sort(([ t1, cat1, idx1 ], [ t2, cat2, idx2 ]) => {
                 /* eslint-enable no-unused-vars */
                   // move categories before all other tags
                   if (cat1 && !cat2) return -1;
                   if (cat2 && !cat1) return 1;
                   return idx1 - idx2;
                 })
                 .map(([ name, cat ]) => ({
                   name,
                   user: entry.user,
                   is_category: cat
                 }));

    env.res.entry_tags = tags;
  });


  // Fetch blog entry comments
  //
  N.wire.before(apiPath, async function fetch_comments(env) {
    let statuses = N.models.blogs.BlogComment.statuses;

    let setting_names = [
      'can_see_hellbanned',
      'blogs_mod_can_delete',
      'blogs_mod_can_see_hard_deleted'
    ];

    let settings = await env.extras.settings.fetch(setting_names);

    let visibleSt = [ statuses.VISIBLE ];

    if (env.user_info.hb || settings.can_see_hellbanned) {
      visibleSt.push(statuses.HB);
    }

    if (settings.blogs_mod_can_delete) {
      visibleSt.push(statuses.DELETED);
    }

    if (settings.blogs_mod_can_see_hard_deleted) {
      visibleSt.push(statuses.DELETED_HARD);
    }

    let comments = await N.models.blogs.BlogComment.find()
                             .where('entry').equals(env.data.entry._id)
                             .where('st').in(visibleSt)
                             .lean(true);

    let comment_paths = {};

    comments.forEach(comment => {
      comment_paths[comment._id] = comment.path.concat(comment._id).map(String).join(',');
    });

    env.data.comments = _.sortBy(comments, comment => comment_paths[comment._id]);
  });


  N.wire.on(apiPath, async function blog_entry(env) {
    env.res.head.title = env.data.entry.title;
    env.res.head.canonical = N.router.linkTo('blogs.entry', env.params);

    env.res.user_id = env.data.user._id;

    env.data.users = env.data.users || [];

    if (env.data.entry.user)   env.data.users.push(env.data.entry.user);
    if (env.data.entry.del_by) env.data.users.push(env.data.entry.del_by);

    if (env.data.entry.import_users) {
      env.data.users = env.data.users.concat(env.data.entry.import_users);
    }

    env.data.comments.forEach(comment => {
      if (comment.user)   env.data.users.push(comment.user);
      if (comment.del_by) env.data.users.push(comment.del_by);

      if (comment.import_users) {
        env.data.users = env.data.users.concat(comment.import_users);
      }
    });

    env.res.entry    = await sanitize_entry(N, env.data.entry, env.user_info);
    env.res.comments = await sanitize_comment(N, env.data.comments, env.user_info);
  });


  // Fill subscription type
  //
  N.wire.after(apiPath, async function fill_subscription(env) {
    if (!env.user_info.is_member) {
      env.res.subscription = null;
      return;
    }

    let subscription = await N.models.users.Subscription.findOne()
                                 .where('user').equals(env.user_info.user_id)
                                 .where('to').equals(env.data.entry._id)
                                 .where('to_type').equals(N.shared.content_type.BLOG_ENTRY)
                                 .lean(true);

    env.res.subscription = subscription ? subscription.type : null;
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

    env.res.breadcrumbs = env.data.breadcrumbs;
  });


  // Update view counter
  //
  // The handler is deliberately synchronous with all updates happening in the
  // background, so it won't affect response time
  //
  N.wire.after(apiPath, function update_view_counter(env) {
    // First-time visitor or a bot, don't count those
    if (!env.session_id) return;

    N.redis.time(function (err, time) {
      if (err) return;

      let score = Math.floor(time[0] * 1000 + time[1] / 1000);
      let key   = env.data.entry._id + '-' + env.session_id;

      N.redis.zscore('views:blog_entry:track_last', key, function (err, old_score) {
        if (err) return;

        // Check if user has loaded the same page in the last 10 minutes,
        // it prevents refreshes and inside-the-topic navigation from being
        // counted.
        //
        if (Math.abs(score - old_score) < 10 * 60 * 1000) { return; }

        N.redis.zadd('views:blog_entry:track_last', score, key, function (err) {
          if (err) return;

          N.redis.hincrby('views:blog_entry:count', String(env.data.entry._id), 1, function () {});
        });
      });
    });
  });


  // Fetch and fill bookmarks
  //
  N.wire.after(apiPath, async function fetch_and_fill_bookmarks(env) {
    let entry_bookmarks = await N.models.blogs.BlogEntryBookmark.find()
                                    .where('user').equals(env.user_info.user_id)
                                    .where('entry').equals(env.data.entry._id)
                                    .lean(true);

    let comment_bookmarks = await N.models.blogs.BlogCommentBookmark.find()
                                      .where('user').equals(env.user_info.user_id)
                                      .where('comment').in(_.map(env.data.comments, '_id'))
                                      .lean(true);

    if (!entry_bookmarks.length || !comment_bookmarks.length) return;

    env.res.own_bookmarks = _.map(entry_bookmarks, 'entry').concat(_.map(comment_bookmarks, 'comment'));
  });


  // Fetch and fill own votes
  //
  N.wire.after(apiPath, async function fetch_votes(env) {
    let votes = await N.models.users.Vote.find()
                          .where('from').equals(env.user_info.user_id)
                          .where('for').in(_.map(env.data.comments, '_id').concat([ env.data.entry._id ]))
                          .where('value').in([ 1, -1 ])
                          .lean(true);

    env.data.own_votes = votes;

    if (!votes.length) return;

    // [ { _id: ..., for: '562f3569c5b8d831367b0585', value: -1 } ] -> { 562f3569c5b8d831367b0585: -1 }
    env.res.own_votes = votes.reduce((acc, vote) => {
      acc[vote.for] = vote.value;
      return acc;
    }, {});
  });


  // Fetch infractions
  //
  N.wire.after(apiPath, async function fetch_infractions(env) {
    let settings = await env.extras.settings.fetch([
      'blogs_mod_can_add_infractions',
      'can_see_infractions'
    ]);

    if (!settings.can_see_infractions && !settings.blogs_mod_can_add_infractions) return;

    let infractions = await N.models.users.Infraction.find()
                                .where('src').in(_.map(env.data.comments, '_id').concat([ env.data.entry._id ]))
                                .where('exists').equals(true)
                                .select('src points ts')
                                .lean(true);

    env.res.infractions = infractions.reduce((acc, infraction) => {
      acc[infraction.src] = infraction;
      return acc;
    }, {});
  });


  // Fetch settings needed on the client-side
  //
  N.wire.after(apiPath, async function fetch_settings(env) {
    env.res.settings = Object.assign({}, env.res.settings, await env.extras.settings.fetch([
      'blogs_can_create',
      'blogs_reply_old_comment_threshold',
      'blogs_mod_can_delete',
      'blogs_mod_can_hard_delete',
      'blogs_mod_can_add_infractions',
      'can_report_abuse',
      'can_vote',
      'can_see_ip',
      'votes_add_max_time',
      'blogs_edit_comments_max_time'
    ]));
  });
};
