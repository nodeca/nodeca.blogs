// Add/remove entry bookmark
//

'use strict';


module.exports = function (N, apiPath) {

  N.validate(apiPath, {
    entry_id: { format: 'mongo', required: true },
    remove:   { type: 'boolean', required: true }
  });


  // Check auth
  //
  N.wire.before(apiPath, function check_auth(env) {
    if (!env.user_info.is_member) throw N.io.FORBIDDEN;
  });


  // Fetch entry
  //
  N.wire.before(apiPath, async function fetch_entry(env) {
    env.data.entry = await N.models.blogs.BlogEntry
                               .findById(env.params.entry_id)
                               .lean(true);

    if (!env.data.entry) throw N.io.NOT_FOUND;
  });


  // Only allow to bookmark public posts
  //
  N.wire.before(apiPath, async function check_access(env) {
    let access_env = { params: {
      entries: env.data.entry,
      user_info: '000000000000000000000000' // guest
    } };

    await N.wire.emit('internal:blogs.access.entry', access_env);

    if (!access_env.data.access_read) {

      // Allow hellbanned users to bookmark their own posts
      //
      if (env.user_info.hb && env.data.entry.st === N.models.blogs.BlogEntry.statuses.HB) {
        let access_env = { params: {
          entries: env.data.entry,
          user_info: env.user_info
        } };

        await N.wire.emit('internal:blogs.access.entry', access_env);

        if (!access_env.data.access_read) {
          throw N.io.NOT_FOUND;
        }

        return;
      }

      throw N.io.NOT_FOUND;
    }
  });


  // Add/remove bookmark
  //
  N.wire.on(apiPath, async function bookmark_add_remove(env) {

    // If `env.params.remove` - remove bookmark
    if (env.params.remove) {
      await N.models.users.Bookmark.deleteOne({
        user: env.user_info.user_id,
        src:  env.data.entry._id
      });
      return;
    }

    // Use `findOneAndUpdate` with `upsert` to avoid duplicates in case of multi click
    await N.models.users.Bookmark.findOneAndUpdate(
      {
        user: env.user_info.user_id,
        src:  env.data.entry._id
      },
      { $set: {
        src_type: N.shared.content_type.BLOG_ENTRY,
        public: true
      } },
      { upsert: true }
    );
  });


  // Update entry, fill count
  //
  N.wire.after(apiPath, async function update_entry(env) {
    let count = await N.models.users.Bookmark.countDocuments({ src: env.data.entry._id });

    env.res.count = count;

    await N.models.blogs.BlogEntry.updateOne(
      { _id: env.data.entry._id },
      { bookmarks: count }
    );
  });
};
