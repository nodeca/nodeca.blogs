// Deliver `BLOGS_NEW_ENTRY` notification
//
'use strict';


const _         = require('lodash');
const render    = require('nodeca.core/lib/system/render/common');
const user_info = require('nodeca.users/lib/user_info');


module.exports = function (N) {
  N.wire.on('internal:users.notify.deliver', async function notify_deliver_blogs_new_entry(local_env) {
    if (local_env.type !== 'BLOGS_NEW_ENTRY') return;

    let entry = await N.models.blogs.BlogEntry.findById(local_env.src).lean(true);

    if (!entry) return;

    let user = await N.models.users.User.findById(entry.user).lean(true);

    if (!user) return;

    // Fetch user info
    let users_info = await user_info(N, local_env.to);

    // Filter post owner (don't send notification to user who create this post)
    //
    local_env.to = local_env.to.filter(user_id => String(user_id) !== String(entry.user));

    // Filter users who aren't watching this blog
    //
    let Subscription = N.models.users.Subscription;

    let subscriptions = await Subscription.find()
                                .where('user').in(local_env.to)
                                .where('to').equals(user._id)
                                .where('type').equals(Subscription.types.WATCHING)
                                .where('to_type').equals(N.shared.content_type.BLOG_SOLE)
                                .lean(true);

    let watching = subscriptions.map(subscription => String(subscription.user));

    // Only if `user_id` in both arrays
    local_env.to = _.intersection(local_env.to, watching);

    // Filter users by access
    //
    await Promise.all(local_env.to.slice().map(user_id => {
      let access_env = { params: {
        entries: entry,
        user_info: users_info[user_id]
      } };

      return N.wire.emit('internal:blogs.access.entry', access_env)
        .then(() => {
          if (!access_env.data.access_read) {
            local_env.to = local_env.to.filter(x => x !== user_id);
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

      let subject = N.i18n.t(locale, 'users.notify.blogs_new_entry.subject', {
        project_name: general_project_name,
        user: user.nick
      });

      let url = N.router.linkTo('blogs.entry', {
        user_hid:  user.hid,
        entry_hid: entry.hid
      });

      let unsubscribe = N.router.linkTo('blogs.sole.unsubscribe', {
        user_hid: user.hid
      });

      let text = render(N, 'users.notify.blogs_new_entry', { html: entry.html, link: url }, helpers);

      local_env.messages[user_id] = { subject, text, url, unsubscribe };
    });
  });
};
