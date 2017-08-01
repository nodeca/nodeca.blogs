// Generate snippets for blog entries and blog comments
//
// TODO: maybe do something with links to user blog
//
'use strict';


const render = require('nodeca.core/lib/system/render/common');


module.exports = function (N) {
  N.wire.on('internal:common.embed.local', async function embed_blog_posts(data) {
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

    let user_id, md, comment;

    if (!comment_hid) {
      // link to entry
      user_id = entry.user;
      md = entry.md;
    } else {
      // link to comment
      comment = await N.models.blogs.BlogComment.findOne()
                              .where('entry').equals(entry._id)
                              .where('hid').equals(comment_hid)
                              .lean(true);

      if (!comment) return;

      user_id = comment.user;
      md = comment.md;
    }

    let user = await N.models.users.User.findById(user_id)
                         .where('exists').equals(true)
                         .lean(true);

    if (data.type === 'block') {
      let preview_data = await N.parser.md2preview({ text: md, limit: 500 });

      let locals = {
        href: N.router.linkTo('blogs.entry', match.params),
        html: preview_data.preview,
        user
      };

      data.html = render(N, 'common.blocks.markup.quote', locals, {});

    } else if (data.type === 'inline') {
      let locals = {
        // preserve inline link exactly as it was (keep hash tags, etc.)
        href: data.url,
        entry,
        comment
      };

      data.html = render(N, 'common.blocks.markup.blog_link', locals, {});
    }
  });
};
