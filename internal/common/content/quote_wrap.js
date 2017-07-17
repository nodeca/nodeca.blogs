// Generate a quote wrapper for blog entries/comments
//

'use strict';


const render = require('nodeca.core/lib/system/render/common');


module.exports = function (N, apiPath) {

  N.wire.on(apiPath, async function blog_quote_wrap(data) {
    if (data.html) return;

    let match = N.router.matchAll(data.url).reduce(
      (acc, match) => (match.meta.methods.get === 'blogs.entry' ? match : acc),
      null
    );

    if (!match) return;

    let entry = await N.models.blogs.BlogEntry.findOne()
                          .where('hid').equals(match.params.entry_hid)
                          .lean(true);

    if (!entry) return;

    let comment_hid, m;

    if (match.params.$anchor && (m = match.params.$anchor.match(/^comment(\d+)$/))) {
      comment_hid = Number(m[1]);
    }

    let user_id;

    if (!comment_hid) {
      // link to entry
      user_id = entry.user;
    } else {
      // link to comment
      let comment = await N.models.blogs.BlogComment.findOne()
                              .where('entry').equals(entry._id)
                              .where('hid').equals(comment_hid)
                              .lean(true);

      if (!comment) return;

      user_id = comment.user;
    }

    let user = await N.models.users.User.findById(user_id)
                         .where('exists').equals(true)
                         .lean(true);

    let locals = {
      href: N.router.linkTo('blogs.entry', match.params),
      user
    };

    data.html = render(N, 'common.blocks.markup.quote', locals, {});
  });
};
