// Fill urls and titles for blog posts (`BLOG_ENTRY`, `BLOG_COMMENT`)
//
// In:
//
// - infractions ([users.Infraction])
// - user_info (Object)
//
// Out:
//
// - info (Object) - key is `src`, value { url, title, text }
//
'use strict';


const _ = require('lodash');


module.exports = function (N, apiPath) {

  // Fetch infractions issued for blog entries
  //
  N.wire.on(apiPath, async function blog_entries_fetch_infraction_info(info_env) {
    let entry_ids = info_env.infractions.filter(i => i.src_type === N.shared.content_type.BLOG_ENTRY)
                                        .map(x => x.src);
    if (!entry_ids.length) return;


    // Fetch entries
    //
    let entries = await N.models.blogs.BlogEntry.find()
                            .where('_id').in(entry_ids)
                            .lean(true);

    // Fetch users
    //
    let users = await N.models.users.User.find()
                          .where('_id').in(entries.map(x => x.user))
                          .lean(true);

    let access_env = { params: {
      entries,
      user_info: info_env.user_info
    } };

    await N.wire.emit('internal:blogs.access.entry', access_env);

    entries = entries.filter((__, idx) => access_env.data.access_read[idx]);

    let users_by_id = _.keyBy(users, '_id');

    entries.forEach(entry => {
      let user = users_by_id[entry.user];
      if (!user) return;

      info_env.info[entry._id] = {
        title: entry.title,
        url: N.router.linkTo('blogs.entry', {
          user_hid:  user.hid,
          entry_hid: entry.hid
        }),
        text: entry.md
      };
    });
  });


  // Fetch infractions issued for blog comments
  //
  N.wire.on(apiPath, async function blog_comments_fetch_infraction_info(info_env) {
    let comment_ids = info_env.infractions.filter(i => i.src_type === N.shared.content_type.BLOG_COMMENT)
                                          .map(x => x.src);
    if (!comment_ids.length) return;


    // Fetch comments
    //
    let comments = await N.models.blogs.BlogComment.find()
                             .where('_id').in(comment_ids)
                             .lean(true);

    // Fetch entries
    //
    let entries = await N.models.blogs.BlogEntry.find()
                            .where('_id').in(comments.map(x => x.entry))
                            .lean(true);

    // Fetch users
    //
    let users = await N.models.users.User.find()
                          .where('_id').in(entries.map(x => x.user))
                          .lean(true);

    let access_env = { params: {
      comments,
      user_info: info_env.user_info,
      preload: entries
    } };

    await N.wire.emit('internal:blogs.access.comment', access_env);

    comments = comments.filter((__, idx) => access_env.data.access_read[idx]);

    let entries_by_id = _.keyBy(entries, '_id');
    let users_by_id   = _.keyBy(users, '_id');

    comments.forEach(comment => {
      let entry = entries_by_id[comment.entry];
      if (!entry) return;

      let user = users_by_id[entry.user];
      if (!user) return;

      info_env.info[comment._id] = {
        title: entry.title,
        url: N.router.linkTo('blogs.entry', {
          user_hid:  user.hid,
          entry_hid: entry.hid,
          $anchor:   'comment' + comment.hid
        }),
        text: comment.md
      };
    });
  });
};
