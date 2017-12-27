// Add gc handler to `N.models.users.Marker`
//
'use strict';


const _              = require('lodash');
const ObjectId       = require('mongoose').Types.ObjectId;
const userInfo       = require('nodeca.users/lib/user_info');
const sanitize_entry = require('nodeca.blogs/lib/sanitizers/blog_entry');


module.exports = function (N) {

  async function blog_entry_gc_handler(userId, categoryId, currentCut) {
    // Fetch user_info
    //
    let user_info = await userInfo(N, userId);

    // Fetch entries
    //
    let cache;

    if (user_info.hb) {
      cache = 'cache_hb';
    } else {
      cache = 'cache';
    }

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

    // Sanitize
    //
    entries = await sanitize_entry(N, entries, user_info);


    return entries.map(entry => ({
      categoryId: entry.user,
      contentId: entry._id,
      lastPostNumber: entry.cache.last_comment_hid,
      lastPostTs: entry.cache.last_ts || entry._id
    }));
  }


  N.wire.after('init:models', { priority: 50 }, function marker_add_gc_handler_blogs() {
    N.models.users.Marker.registerGc('blog_entry', blog_entry_gc_handler);
  });
};
