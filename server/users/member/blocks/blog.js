// Fill user's last blog entries
//
'use strict';


const _              = require('lodash');
const sanitize_entry = require('nodeca.blogs/lib/sanitizers/blog_entry');


module.exports = function (N) {

  const BLOG_ENTRY_LIMIT = 3;


  // Define visible statuses
  //
  N.wire.after('server:users.member', async function define_visible_statuses(env) {
    let settings = await env.extras.settings.fetch([
      'blogs_mod_can_delete',
      'blogs_mod_can_see_hard_deleted',
      'can_see_hellbanned'
    ]);

    let statuses = N.models.blogs.BlogEntry.statuses;

    env.data.blog_entries_visible_statuses = [ statuses.VISIBLE ];

    if (settings.blogs_mod_can_delete) {
      env.data.blog_entries_visible_statuses.push(statuses.DELETED);
    }

    if (settings.blogs_mod_can_see_hard_deleted) {
      env.data.blog_entries_visible_statuses.push(statuses.DELETED_HARD);
    }

    if (settings.can_see_hellbanned || env.user_info.hb) {
      env.data.blog_entries_visible_statuses.push(statuses.HB);
    }
  });


  // Fetch user blog entries
  //
  N.wire.after('server:users.member', async function fetch_user_blog_entries(env) {
    let entries = await N.models.blogs.BlogEntry.find()
                            .where('user').equals(env.data.user._id)
                            .where('st').in(env.data.blog_entries_visible_statuses)
                            .sort('-_id')
                            .limit(BLOG_ENTRY_LIMIT)
                            .lean(true);

    // sanitize entries
    entries = await sanitize_entry(N, entries, env.user_info);

    // avoid sending large attributes to the client that won't be used
    entries = entries.map(e =>
      _.omit(e, [ 'html' ])
    );

    // hide blog widget if no blog entries were created
    if (env.user_info.user_hid !== env.data.user.hid && entries.length === 0) return;

    env.res.blocks = env.res.blocks || {};
    _.set(env.res, 'blocks.blog', { list: entries });
  });


  // Fetch user blog entry count
  //
  N.wire.after('server:users.member', async function fetch_blog_entry_count(env) {

    if (!_.get(env.res, 'blocks.blog')) return;

    env.res.blocks.blog.count = await N.models.blogs.BlogEntry.countDocuments()
                                          .where('user').equals(env.data.user._id)
                                          .where('st').in(env.data.blog_entries_visible_statuses)
                                          .sort('-_id')
                                          .lean(true);
  });
};
