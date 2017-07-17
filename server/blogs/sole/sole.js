// List of blog entries created by a user
//

'use strict';

const _ = require('lodash');


module.exports = function (N, apiPath) {

  N.validate(apiPath, {
    user_hid: { type: 'integer', minimum: 1, required: true }
  });


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
  });


  // Fetch entries and tags for this user
  //
  N.wire.before(apiPath, async function fetch_entries(env) {
    env.data.entries = await N.models.blogs.BlogEntry.find()
                                 .where('user').equals(env.data.user._id)
                                 .where('st').equals(N.models.blogs.BlogEntry.statuses.VISIBLE)
                                 .sort('-_id')
                                 .limit(20)
                                 .lean(true);

    let tagset = new Set();

    for (let entry of env.data.entries) {
      for (let hid of entry.tag_hids || []) {
        tagset.add(hid);
      }
    }

    env.data.tags = await N.models.blogs.BlogTag.find()
                              .where('hid').in(Array.from(tagset.values()))
                              .limit(20)
                              .lean(true);
  });


  N.wire.on(apiPath, async function blog_member(env) {
    let user = env.data.user;

    env.res.head.title = env.t('title_with_user', { user: env.user_info.is_member ? user.name : user.nick });
    env.res.head.canonical = N.router.linkTo('blogs.sole', env.params);

    env.data.users = env.data.users || [];
    env.data.users.push(env.data.user._id);

    env.res.user_id = env.data.user._id;

    // TODO: move it to separate sanitizer, check hellbanned for votes_hb
    env.res.categories = env.data.categories.map(tag => _.pick(tag, [
      '_id', 'hid', 'name'
    ]));
    env.res.entries    = env.data.entries.map(entry => _.pick(entry, [
      '_id', 'hid', 'title', 'html', 'comments', 'user', 'ts', 'tag_hids'
    ]));
    env.res.tags       = _.keyBy(env.data.tags.map(tag => _.pick(tag, [
      '_id', 'hid', 'name', 'is_category'
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

    env.res.breadcrumbs = env.data.breadcrumbs;
  });
};
