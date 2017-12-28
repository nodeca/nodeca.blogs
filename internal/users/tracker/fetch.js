// Fetch entries for tracker
//
'use strict';


const ObjectId       = require('mongoose').Types.ObjectId;
const _              = require('lodash');
const sanitize_entry = require('nodeca.blogs/lib/sanitizers/blog_entry');


module.exports = function (N, apiPath) {

  N.wire.on(apiPath, async function tracker_fetch_entries(env) {
    let entry_subs = _.filter(env.data.subscriptions, { to_type: N.shared.content_type.BLOG_ENTRY });
    let blog_subs = _.filter(env.data.subscriptions, { to_type: N.shared.content_type.BLOG_SOLE });


    // Fetch entries by entry subscriptions
    //
    let entries = [];

    if (entry_subs.length !== 0) {
      entries = await N.models.blogs.BlogEntry.find()
                          .where('_id').in(_.map(entry_subs, 'to'))
                          .lean(true);
    }


    // Fetch entries by blog subscriptions
    //
    if (blog_subs.length !== 0) {
      let cuts = await N.models.users.Marker.cuts(env.user_info.user_id, _.map(blog_subs, 'to'));
      let queryParts = [];

      _.forEach(cuts, (cutTs, id) => {
        queryParts.push({ user: id, _id: { $gt: new ObjectId(Math.round(cutTs / 1000)) } });
      });

      entries = entries.concat(await N.models.blogs.BlogEntry.find({ $or: queryParts }).lean(true) || []);
      entries = _.uniqBy(entries, entry => String(entry._id));
    }


    // Sanitize entries, replace cache with cache_hb if needed
    entries = await sanitize_entry(N, entries, env.user_info);


    // Fetch read marks
    //
    let data = entries.map(entry => ({
      categoryId: entry.user,
      contentId: entry._id,
      lastPostNumber: entry.cache.last_comment_hid,
      lastPostTs: entry.cache.last_ts
    }));

    let read_marks = await N.models.users.Marker.info(env.user_info.user_id, data);


    // Filter new and unread entries
    entries = entries.filter(entry => read_marks[entry._id].isNew || read_marks[entry._id].next !== -1);


    // Check permissions subcall
    //
    let access_env = { params: {
      entries,
      user_info: env.user_info
    } };

    await N.wire.emit('internal:blogs.access.entry', access_env);

    entries = entries.filter((__, idx) => access_env.data.access_read[idx]);


    // Collect user ids
    //
    env.data.users = env.data.users || [];
    env.data.users = env.data.users.concat(_.map(entries, 'user'));
    env.data.users = env.data.users.concat(_.map(entries, 'cache.last_user').filter(Boolean));


    env.res.blog_entries = _.keyBy(entries, '_id');
    env.res.read_marks = _.assign(env.res.read_marks || {}, read_marks);

    entries.forEach(entry => {
      env.data.items.push({
        type: 'blog_entry',
        last_ts: entry.cache.last_ts || entry.ts,
        id: entry._id
      });
    });
  });
};
