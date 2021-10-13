// Deliver `BLOGS_REPLY` notification
//
'use strict';


const render    = require('nodeca.core/lib/system/render/common');
const user_info = require('nodeca.users/lib/user_info');


module.exports = function (N) {

  // Notification will not be sent if target user:
  //
  // 1. replies to his own post
  // 2. muted this blog entry
  // 3. no longer has access to this blog entry
  // 4. ignores sender of this message
  //
  N.wire.on('internal:users.notify.deliver', async function notify_deliver_blogs_reply(local_env) {
    if (local_env.type !== 'BLOGS_REPLY') return;

    let comment = await N.models.blogs.BlogComment.findById(local_env.src).lean(true);
    if (!comment) return;

    let entry = await N.models.blogs.BlogEntry.findById(comment.entry).lean(true);
    if (!entry) return;

    let blog_user = await N.models.users.User.findById(entry.user).lean(true);
    if (!blog_user) return;

    let comment_user = await N.models.users.User.findById(comment.user).lean(true);
    if (!comment_user) return;

    let from_user_id = String(comment.user);

    // Fetch parent comment
    if (!comment.path?.length) return;

    let parent_id = comment.path[comment.path.length - 1];
    let parent_comment = await N.models.blogs.BlogComment.findById(parent_id).lean(true);
    if (!parent_comment) return;

    let user_ids = new Set([ String(parent_comment.user) ]);

    // Apply ignores (list of users who already received this notification earlier)
    for (let user_id of local_env.ignore || []) user_ids.delete(user_id);

    // Fetch user info
    let users_info = await user_info(N, Array.from(user_ids));

    // 1. filter by post owner (don't send notification if user replies to her own post)
    //
    user_ids.delete(from_user_id);

    // 2. filter users who muted this entry
    //
    let muted = await N.models.users.Subscription.find()
                          .where('user').in(Array.from(user_ids))
                          .where('to').equals(entry._id)
                          .where('type').equals(N.models.users.Subscription.types.MUTED)
                          .lean(true);

    for (let sub of muted) {
      user_ids.delete(String(sub.user));
    }

    // 3. filter users by access
    //
    for (let user_id of user_ids) {
      let access_env = { params: {
        comments: comment,
        user_info: users_info[user_id],
        preload: [ entry ]
      } };

      await N.wire.emit('internal:blogs.access.comment', access_env);

      if (!access_env.data.access_read) user_ids.delete(user_id);
    }

    // 4. filter out ignored users
    //
    let ignore_data = await N.models.users.Ignore.find()
                                .where('from').in(Array.from(user_ids))
                                .where('to').equals(from_user_id)
                                .select('from to -_id')
                                .lean(true);

    for (let ignore of ignore_data) {
      user_ids.delete(String(ignore.from));
    }

    // Render messages
    //
    let general_project_name = await N.settings.get('general_project_name');

    for (let user_id of user_ids) {
      let locale = users_info[user_id].locale || N.config.locales[0];
      let helpers = {};

      helpers.t = (phrase, params) => N.i18n.t(locale, phrase, params);
      helpers.t.exists = phrase => N.i18n.hasPhrase(locale, phrase);

      let subject = N.i18n.t(locale, 'users.notify.blogs_reply.subject', {
        project_name: general_project_name,
        user: comment_user.nick
      });

      let url = N.router.linkTo('blogs.entry', {
        user_hid:  blog_user.hid,
        entry_hid: entry.hid,
        $anchor:   'comment' + comment.hid
      });

      let unsubscribe = N.router.linkTo('blogs.entry.mute', {
        user_hid:  blog_user.hid,
        entry_hid: entry.hid
      });

      let text = render(N, 'users.notify.blogs_reply', { html: comment.html, link: url }, helpers);

      local_env.messages[user_id] = { subject, text, url, unsubscribe };
    }
  });
};
