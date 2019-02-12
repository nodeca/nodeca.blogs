// Add/remove comment bookmark
//

'use strict';


module.exports = function (N, apiPath) {

  N.validate(apiPath, {
    comment_id: { format: 'mongo', required: true },
    remove:     { type: 'boolean', required: true }
  });


  // Check auth
  //
  N.wire.before(apiPath, function check_auth(env) {
    if (!env.user_info.is_member) throw N.io.FORBIDDEN;
  });


  // Fetch comment
  //
  N.wire.before(apiPath, async function fetch_comment(env) {
    env.data.comment = await N.models.blogs.BlogComment
                                 .findById(env.params.comment_id)
                                 .lean(true);

    if (!env.data.comment) throw N.io.NOT_FOUND;
  });


  // Fetch entry
  //
  N.wire.before(apiPath, async function fetch_entry(env) {
    env.data.entry = await N.models.blogs.BlogEntry
                               .findById(env.data.comment.entry)
                               .lean(true);

    if (!env.data.entry) throw N.io.NOT_FOUND;
  });


  // Check if user can see this comment
  //
  N.wire.before(apiPath, async function check_access(env) {
    let access_env = { params: {
      comments:  env.data.comment,
      user_info: env.user_info,
      preload:   [ env.data.entry ]
    } };

    await N.wire.emit('internal:blogs.access.comment', access_env);

    if (!access_env.data.access_read) throw N.io.NOT_FOUND;
  });


  // Add/remove bookmark
  //
  N.wire.on(apiPath, async function bookmark_add_remove(env) {

    // If `env.params.remove` - remove bookmark
    if (env.params.remove) {
      await N.models.blogs.BlogCommentBookmark.deleteOne(
        { user: env.user_info.user_id, comment: env.data.comment._id }
      );
      return;
    }

    // Add bookmark
    let data = { user: env.user_info.user_id, comment: env.data.comment._id };

    // Use `findOneAndUpdate` with `upsert` to avoid duplicates in case of multi click
    await N.models.blogs.BlogCommentBookmark.findOneAndUpdate(
      data,
      { $set: data },
      { upsert: true }
    );
  });


  // Update entry, fill count
  //
  N.wire.after(apiPath, async function update_entry(env) {
    let count = await N.models.blogs.BlogCommentBookmark.countDocuments({ comment: env.data.comment._id });

    env.res.count = count;

    await N.models.blogs.BlogComment.updateOne(
      { _id: env.data.comment._id },
      { bookmarks: count }
    );
  });
};
