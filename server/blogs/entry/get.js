// Get blog entry by its id without comments; used to partially refresh page
// after undeletion, voting, etc.
//

'use strict';

const _                = require('lodash');
const sanitize_entry   = require('nodeca.blogs/lib/sanitizers/blog_entry');


module.exports = function (N, apiPath) {

  N.validate(apiPath, {
    entry_id: { format: 'mongo', required: true }
  });


  N.wire.before(apiPath, async function fetch_blog_entry(env) {
    env.data.entry = await N.models.blogs.BlogEntry.findById(env.params.entry_id)
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
                   return [ name, tags_by_name[name_lc]?.is_category, idx ];
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


  N.wire.on(apiPath, async function blog_entry(env) {
    env.res.user_id = env.data.user._id;

    env.data.users = env.data.users || [];

    if (env.data.entry.user)   env.data.users.push(env.data.entry.user);
    if (env.data.entry.del_by) env.data.users.push(env.data.entry.del_by);

    if (env.data.entry.import_users) {
      env.data.users = env.data.users.concat(env.data.entry.import_users);
    }

    env.res.entry    = await sanitize_entry(N, env.data.entry, env.user_info);
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

    env.res.subscription = subscription?.type;
  });


  // Fetch and fill bookmarks
  //
  N.wire.after(apiPath, async function fetch_and_fill_bookmarks(env) {
    let bookmarks = await N.models.users.Bookmark.find()
                              .where('user').equals(env.user_info.user_id)
                              .where('src').equals(env.data.entry._id)
                              .lean(true);

    if (!bookmarks.length) return;

    env.res.own_bookmarks = bookmarks.map(x => x.src);
  });


  // Fetch and fill own votes
  //
  N.wire.after(apiPath, async function fetch_votes(env) {
    let votes = await N.models.users.Vote.find()
                          .where('from').equals(env.user_info.user_id)
                          .where('for').in([ env.data.entry._id ])
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
                                .where('src').in([ env.data.entry._id ])
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
      'blogs_edit_comments_max_time',
      'blogs_show_ignored'
    ]));
  });
};
