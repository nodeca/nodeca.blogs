// Blog entry
//

'use strict';

const _ = require('lodash');


module.exports = function (N, apiPath) {

  N.validate(apiPath, {
    user_hid:    { type: 'integer', minimum: 1, required: true },
    entry_hid:   { type: 'integer', minimum: 1, required: true },
    comment_hid: { type: 'integer', minimum: 1 }
  });


  N.wire.before(apiPath, async function fetch_blog_entry(env) {
    env.data.entry = await N.models.blogs.BlogEntry.findOne()
                               .where('hid').equals(env.params.entry_hid)
                               .where('st').equals(N.models.blogs.BlogEntry.statuses.VISIBLE)
                               .lean(true);

    if (!env.data.entry) throw N.io.NOT_FOUND;

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
    if (!env.data.entry.tag_hids || !env.data.entry.tag_hids.length) {
      env.data.tags = [];
      return;
    }

    env.data.tags = await N.models.blogs.BlogTag.find()
                             .where('hid').in(env.data.entry.tag_hids)
                             .lean(true);
  });


  // Fetch blog entry comments
  //
  N.wire.before(apiPath, async function fetch_comments(env) {
    let comments = await N.models.blogs.BlogComment.find()
                             .where('entry').equals(env.data.entry._id)
                             .where('st').equals(N.models.blogs.BlogComment.statuses.VISIBLE)
                             .lean(true);

    let comment_paths = {};

    comments.forEach(comment => {
      comment_paths[comment._id] = comment.path.concat(comment._id).map(String).join(',');
    });

    env.data.comments = _.sortBy(comments, comment => comment_paths[comment._id]);
  });


  N.wire.on(apiPath, function blog_entry(env) {
    env.res.head.title = env.data.entry.title;
    env.res.head.canonical = N.router.linkTo('blogs.entry', env.params);

    env.res.user_id = env.data.user._id;

    env.data.users = (env.data.users || [])
                       .concat([ env.data.user._id ])
                       .concat(_.map(env.data.comments, 'user'));

    // TODO: move it to separate sanitizer, check hellbanned for votes_hb
    env.res.entry    = _.pick(env.data.entry, [
      '_id', 'hid', 'title', 'html', 'comments', 'user', 'ts', 'views', 'tag_hids'
    ]);
    env.res.comments = env.data.comments.map(comment => _.pick(comment, [
      '_id', 'hid', 'html', 'user', 'ts', 'path'
    ]));
    env.res.tags     = _.keyBy(env.data.tags.map(tag => _.pick(tag, [
      '_id', 'hid', 'user', 'name', 'is_category'
    ])), 'hid');
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

    env.data.breadcrumbs.push({
      text:    env.data.entry.title
    });

    env.res.breadcrumbs = env.data.breadcrumbs;
  });
};
