// When user removes a bookmark from bookmark list, we need to
// update bookmark counters for the corresponding post
//

'use strict';


module.exports = function (N) {

  N.wire.after('server:users.bookmarks.destroy', async function update_blog_entry_bookmark_counters(env) {
    if (!env.data.bookmark) return;
    if (env.data.bookmark.src_type !== N.shared.content_type.BLOG_ENTRY) return;

    let count = await N.models.users.Bookmark.countDocuments({ src: env.data.bookmark.src });

    await N.models.blogs.BlogEntry.updateOne(
      { _id: env.data.bookmark.src },
      { bookmarks: count }
    );
  });

  N.wire.after('server:users.bookmarks.destroy', async function update_blog_comment_bookmark_counters(env) {
    if (!env.data.bookmark) return;
    if (env.data.bookmark.src_type !== N.shared.content_type.BLOG_COMMENT) return;

    let count = await N.models.users.Bookmark.countDocuments({ src: env.data.bookmark.src });

    await N.models.blogs.BlogComment.updateOne(
      { _id: env.data.bookmark.src },
      { bookmarks: count }
    );
  });
};
