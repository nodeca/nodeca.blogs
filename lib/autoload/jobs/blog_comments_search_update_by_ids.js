// Add blog comments to search index
//
'use strict';


const _              = require('lodash');
const docid_comments = require('nodeca.blogs/lib/search/docid_comments');
const docid_entries  = require('nodeca.blogs/lib/search/docid_entries');
const docid_sole     = require('nodeca.blogs/lib/search/docid_sole');
const userInfo       = require('nodeca.users/lib/user_info');


module.exports = function (N) {

  N.wire.on('init:jobs', function register_blog_comments_search_update_by_ids() {

    N.queue.registerTask({
      name: 'blog_comments_search_update_by_ids',
      pool: 'hard',
      removeDelay: 3600,
      async process(ids, options = {}) {
        let comments = await N.models.blogs.BlogComment.find()
                                 .where('_id').in(ids)
                                 .lean(true);

        if (!comments.length) return;

        let entries = await N.models.blogs.BlogEntry.find()
                                .where('_id').in(_.uniq(comments.map(comment => String(comment.entry))))
                                .lean(true);

        let users = await N.models.users.User.find()
                              .where('_id').in(_.uniq(entries.map(entry => String(entry.user))))
                              .lean(true);

        let entries_by_id = _.keyBy(entries, '_id');
        let users_by_id = _.keyBy(users, '_id');

        let user_info = await userInfo(N, null);

        let access_env = { params: {
          comments,
          user_info,
          preload: entries
        } };

        await N.wire.emit('internal:blogs.access.comment', access_env);

        let values = [];
        let args = [];

        for (let idx = 0; idx < comments.length; idx++) {
          let comment   = comments[idx];
          let entry     = entries_by_id[comment.entry];
          let is_public = access_env.data.access_read[idx];

          if (!entry) {
            N.logger.error(`Cannot find blog entry ${comment.entry} referred by comment ${comment._id}`);
            continue;
          }

          let user = users_by_id[entry.user];

          if (!user) {
            N.logger.error(`Cannot find blog user ${entry.user} referred by entry ${entry._id}`);
            continue;
          }

          // only check `st` for posts assuming st=HB,ste=VISIBLE posts aren't public
          let visible = comment.st === N.models.blogs.BlogComment.statuses.VISIBLE &&
                        entry.st === N.models.blogs.BlogEntry.statuses.VISIBLE;

          values.push('(?,?,?,?,?,?,?,?)');

          args.push(
            // id
            docid_comments(N, entry.hid, comment.hid),
            // content
            comment.html,
            // object_id
            String(comment._id),
            // user_uid
            docid_sole(N, user.hid),
            // entry_uid
            docid_entries(N, entry.hid),
            // public
            (is_public && visible) ? 1 : 0,
            // visible
            visible ? 1 : 0,
            // ts
            Math.floor(comment.ts / 1000)
          );
        }

        let query = `
          REPLACE INTO blog_comments
          (id, content, object_id, user_uid, entry_uid, public, visible, ts)
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
