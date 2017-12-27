// Add blog entries to search index
//
'use strict';


const _              = require('lodash');
const docid_entries  = require('nodeca.blogs/lib/search/docid_entries');
const docid_sole     = require('nodeca.blogs/lib/search/docid_sole');
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

        let users = await N.models.users.User.find()
                              .where('_id').in(_.uniq(entries.map(entry => String(entry.user))))
                              .lean(true);

        let users_by_id = _.keyBy(users, '_id');

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

          let user = users_by_id[entry.user];

          if (!user) {
            N.logger.error(`Cannot find blog user ${entry.user} referred by entry ${entry._id}`);
            continue;
          }

          // only check `st` for posts assuming st=HB,ste=VISIBLE posts aren't public
          let visible = entry.st === N.models.blogs.BlogEntry.statuses.VISIBLE;

          values.push('(?,?,?,?,?,?,?,?,?)');

          args.push(
            // id
            docid_entries(N, entry.hid),
            // title
            entry.title,
            // content
            entry.html,
            // object_id
            String(entry._id),
            // user_uid
            docid_sole(N, user.hid),
            // comment_count
            entry.cache.comment_count,
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
          (id, title, content, object_id, user_uid, comment_count, public, visible, ts)
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
