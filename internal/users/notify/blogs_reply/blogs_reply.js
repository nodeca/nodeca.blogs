// Deliver `BLOGS_REPLY` notification
//
'use strict';


const _         = require('lodash');
const render    = require('nodeca.core/lib/system/render/common');
const user_info = require('nodeca.users/lib/user_info');


module.exports = function (N) {
  N.wire.on('internal:users.notify.deliver', async function notify_deliver_froum_reply(local_env) {
    if (local_env.type !== 'BLOGS_REPLY') return;

    let comment = await N.models.blogs.BlogComment.findById(local_env.src).lean(true);

    if (!comment) return;

    let entry = await N.models.blogs.BlogEntry.findById(comment.entry).lean(true);

    if (!entry) return;

    let blog_user = await N.models.users.User.findById(entry.user).lean(true);

    if (!blog_user) return;

    let comment_user = await N.models.users.User.findById(comment.user).lean(true);

    if (!comment_user) return;

    // Fetch user info
    let users_info = await user_info(N, local_env.to);

    // Filter by post owner (don't send notification if user replies to her own post)
    //
    local_env.to = local_env.to.filter(user_id => String(user_id) !== String(comment.user));

    // Filter users who muted this entry
    //
    let Subscription = N.models.users.Subscription;

    let subscriptions = await Subscription.find()
                                .where('user').in(local_env.to)
                                .where('to').equals(entry._id)
                                .where('type').equals(Subscription.types.MUTED)
                                .lean(true);

    let muted = subscriptions.map(subscription => String(subscription.user));

    // If `user_id` only in `local_env.to`
    local_env.to = _.difference(local_env.to, muted);

    // Filter users by access
    //
    await Promise.all(local_env.to.slice().map(user_id => {
      let access_env = { params: {
        comments: comment,
        user_info: users_info[user_id],
        preload: [ entry ]
      } };

      return N.wire.emit('internal:blogs.access.comment', access_env)
        .then(() => {
          if (!access_env.data.access_read) {
            local_env.to = _.without(local_env.to, user_id);
          }
        });
    }));

    // Render messages
    //
    let general_project_name = await N.settings.get('general_project_name');

    local_env.to.forEach(user_id => {
      let locale = users_info[user_id].locale || N.config.locales[0];
      let helpers = {};

      helpers.t = (phrase, params) => N.i18n.t(locale, phrase, params);
      helpers.t.exists = phrase => N.i18n.hasPhrase(locale, phrase);

      let subject = N.i18n.t(locale, 'users.notify.blogs_reply.subject', {
        project_name: general_project_name,
        user_name: comment_user.name
      });

      let url = N.router.linkTo('blogs.entry', {
        user_hid:  blog_user.hid,
        entry_hid: entry.hid,
        $anchor:   'comment' + comment.hid
      });

      let unsubscribe = N.router.linkTo('blogs.entry.unsubscribe', {
        user_hid:  blog_user.hid,
        entry_hid: entry.hid
      });

      let text = render(N, 'users.notify.blogs_new_comment', { html: comment.html, link: url }, helpers);

      local_env.messages[user_id] = { subject, text, url, unsubscribe };
    });
  });
};
