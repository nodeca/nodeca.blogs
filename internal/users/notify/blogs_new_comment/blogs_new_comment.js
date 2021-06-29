// Deliver `BLOGS_NEW_COMMENT` notification
//
'use strict';


const _         = require('lodash');
const render    = require('nodeca.core/lib/system/render/common');
const user_info = require('nodeca.users/lib/user_info');


module.exports = function (N) {
  N.wire.on('internal:users.notify.deliver', async function notify_deliver_blogs_new_comment(local_env) {
    if (local_env.type !== 'BLOGS_NEW_COMMENT') return;

    let comment = await N.models.blogs.BlogComment.findById(local_env.src).lean(true);

    if (!comment) return;

    let entry = await N.models.blogs.BlogEntry.findById(comment.entry).lean(true);

    if (!entry) return;

    let user = await N.models.users.User.findById(entry.user).lean(true);

    if (!user) return;

    // Fetch parent comment if it exists
    let parent_comment;

    if (comment.path?.length) {
      let parent_id = comment.path[comment.path.length - 1];

      parent_comment = await N.models.blogs.BlogComment.findById(parent_id).lean(true);
    }

    // Fetch user info
    let users_info = await user_info(N, local_env.to);

    // Filter post owner (don't send notification to user who create this post)
    //
    local_env.to = local_env.to.filter(user_id => String(user_id) !== String(entry.user));

    // If parent comment is set, don't send user this notification because reply
    // notification has been already sent
    //
    if (parent_comment) {
      local_env.to = local_env.to.filter(user_id => String(user_id) !== String(parent_comment.user));
    }

    // Filter users who aren't watching this entry
    //
    let Subscription = N.models.users.Subscription;

    let subscriptions = await Subscription.find()
                                .where('user').in(local_env.to)
                                .where('to').equals(entry._id)
                                .where('type').equals(Subscription.types.WATCHING)
                                .where('to_type').equals(N.shared.content_type.BLOG_ENTRY)
                                .lean(true);

    let watching = subscriptions.map(subscription => String(subscription.user));

    // Only if `user_id` in both arrays
    local_env.to = _.intersection(local_env.to, watching);

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

      let text = render(N, 'users.notify.blogs_new_comment', { html: comment.html, link: url }, helpers);

      local_env.messages[user_id] = { subject, text, url, unsubscribe };
    });
  });
};
