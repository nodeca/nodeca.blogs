// Add blog entries to search index
//
'use strict';


const docid_entries  = require('nodeca.blogs/lib/search/docid_entries');
const userInfo       = require('nodeca.users/lib/user_info');


module.exports = function (N) {

  N.wire.on('init:jobs', function register_blog_entries_search_update_by_ids() {

    N.queue.registerTask({
      name: 'blog_entries_search_update_by_ids',
      pool: 'hard',
      removeDelay: 3600,
      async process(ids, options = {}) {
        let entries = await N.models.blogs.BlogEntry.find()
                                .where('_id').in(ids)
                                .lean(true);

        if (!entries.length) return;

        let user_info = await userInfo(N, null);

        let access_env = { params: {
          entries,
          user_info
        } };

        await N.wire.emit('internal:blogs.access.entry', access_env);

        let values = [];
        let args = [];

        for (let idx = 0; idx < entries.length; idx++) {
          let entry     = entries[idx];
          let is_public = access_env.data.access_read[idx];

          // only check `st` for posts assuming st=HB,ste=VISIBLE posts aren't public
          let visible = entry.st === N.models.blogs.BlogEntry.statuses.VISIBLE;

          values.push('(?,?,?,?,?,?,?)');

          args.push(
            // id
            docid_entries(N, entry.hid),
            // content
            entry.html,
            // object_id
            String(entry._id),
            // comment_count
            entry.comments,
            // public
            (is_public && visible) ? 1 : 0,
            // visible
            visible ? 1 : 0,
            // ts
            Math.floor(entry.ts / 1000)
          );
        }

        let query = `
          REPLACE INTO blog_entries
          (id, content, object_id, comment_count, public, visible, ts)
          VALUES ${values.join(', ')}
        `.replace(/\n\s*/mg, '');

        if (options.shadow) {
          await N.search.execute_shadow(query, args);
        } else {
          await N.search.execute(query, args);
        }
      }
    });
  });
};
