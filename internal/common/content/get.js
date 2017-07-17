// Return full blog entry/comment contents for quote/snippet expansion
//

'use strict';


module.exports = function (N, apiPath) {

  N.wire.on(apiPath, async function get_blog_contents(data) {
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

    if (!comment_hid) {
      // link to entry
      data.html  = entry.html;
      data.users = entry.import_users;
      return;
    }

    // link to comment
    let comment = await N.models.blogs.BlogComment.findOne()
                            .where('entry').equals(entry._id)
                            .where('hid').equals(comment_hid)
                            .lean(true);

    if (!comment) return;

    data.html  = comment.html;
    data.users = comment.import_users;
  });
};
