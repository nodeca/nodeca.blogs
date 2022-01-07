// Deliver `BLOGS_NEW_COMMENT` notification
//
'use strict';


const render    = require('nodeca.core/lib/system/render/common');
const user_info = require('nodeca.users/lib/user_info');


module.exports = function (N) {

  // Notification will not be sent if target user:
  //
  // 1. creates comment himself
  // 2. no longer has access to this blog entry
  // 3. ignores sender of this message
  //
  N.wire.on('internal:users.notify.deliver', async function notify_deliver_blogs_new_comment(local_env) {
    if (local_env.type !== 'BLOGS_NEW_COMMENT') return;

    let comment = await N.models.blogs.BlogComment.findById(local_env.src).lean(true);
    if (!comment) return;

    let entry = await N.models.blogs.BlogEntry.findById(comment.entry).lean(true);
    if (!entry) return;

    let user = await N.models.users.User.findById(entry.user).lean(true);
    if (!user) return;

    let from_user_id = String(comment.user);

    // Get list of subscribed users
    //
    let subscriptions = await N.models.users.Subscription.find()
                                  .where('to').equals(entry._id)
                                  .where('type').equals(N.models.users.Subscription.types.WATCHING)
                                  .lean(true);

    if (!subscriptions.length) return;

    let user_ids = new Set(subscriptions.map(subscription => String(subscription.user)));

    // Apply ignores (list of users who already received this notification earlier)
    for (let user_id of local_env.ignore || []) user_ids.delete(user_id);

    // Fetch user info
    let users_info = await user_info(N, Array.from(user_ids));

    // 1. filter post owner (don't send notification to user who create this post)
    //
    user_ids.delete(from_user_id);

    // 2. filter users by access
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

    // 3. filter out ignored users
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
      helpers.asset_body = path => N.assets.asset_body(path);

      let subject = N.i18n.t(locale, 'users.notify.blogs_new_comment.subject', {
        project_name: general_project_name,
        entry_title: entry.title
      });

      let url = N.router.linkTo('blogs.entry', {
        user_hid:  user.hid,
        entry_hid: entry.hid,
        $anchor:   'comment' + comment.hid
      });

      let unsubscribe = N.router.linkTo('blogs.entry.unsubscribe', {
        user_hid:  user.hid,
        entry_hid: entry.hid
      });

      let text = render(N, 'users.notify.blogs_new_comment', {
        title: entry.title,
        post_html: comment.html,
        url,
        unsubscribe
      }, helpers);

      local_env.messages[user_id] = { subject, text };
    }
  });
};
