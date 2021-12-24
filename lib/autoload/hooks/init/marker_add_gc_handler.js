// Add gc handler to `N.models.users.Marker`
//
'use strict';


const _         = require('lodash');
const ObjectId  = require('mongoose').Types.ObjectId;
const userInfo  = require('nodeca.users/lib/user_info');


module.exports = function (N) {

  async function blog_entry_gc_handler(userId, contentId, categoryId, max, currentCut) {

    // Fetch user_info
    //
    let user_info = await userInfo(N, userId);

    // Skip gc on scroll if topic end is not reached (to improve performance)
    //
    let can_see_hellbanned = await N.settings.get('can_see_hellbanned', {
      user_id: user_info.user_id,
      usergroup_ids: user_info.usergroups
    }, {});

    let cache = (user_info.hb || can_see_hellbanned) ? 'cache_hb' : 'cache';

    let entry = await N.models.blogs.BlogEntry.findById(contentId).lean(true);

    // only run GC if last comment is new
    if ((entry[cache].last_ts || entry.ts) < currentCut) return [];

    // only run GC if user read the last comment
    if (max < (entry[cache].last_comment_hid || 1)) return [];

    // Fetch entries
    //
    // `entry_id >= cut` or `last_comment_id >= cut`
    let entries = [].concat(
      await N.models.blogs.BlogEntry.find()
                .where('user').equals(categoryId)
                .where('_id').gt(new ObjectId(Math.round(currentCut / 1000)))
                .lean(true)
    ).concat(
      await N.models.blogs.BlogEntry.find()
                .where('user').equals(categoryId)
                .where(cache + '.last_comment').gt(new ObjectId(Math.round(currentCut / 1000)))
                .lean(true)
    );

    entries = _.uniqBy(entries, entry => String(entry._id));

    // Check access
    //
    let access_env = { params: { entries, user_info } };

    await N.wire.emit('internal:blogs.access.entry', access_env);

    entries = entries.filter((__, i) => access_env.data.access_read[i]);

    return entries.map(entry => ({
      categoryId: entry.user,
      contentId: entry._id,
      lastPostNumber: entry[cache].last_comment_hid,
      lastPostTs: entry[cache].last_ts || entry._id
    }));
  }


  N.wire.after('init:models', { priority: 50 }, function marker_add_gc_handler_blogs() {
    N.models.users.Marker.registerGc('blog_entry', blog_entry_gc_handler);
  });
};
