// Index selected blog entries and all comments inside them
//
'use strict';


const _        = require('lodash');
const Queue    = require('idoit');


const CHUNKS_TO_ADD    = 100;
const CHUNKS_MIN_COUNT = 1;
const POSTS_PER_CHUNK  = 100;


module.exports = function (N) {

  N.wire.on('init:jobs', function register_blog_entries_search_update_with_comments() {

    N.queue.registerTask({
      name: 'blog_entries_search_update_with_comments',
      pool: 'hard',
      baseClass: Queue.GroupTemplate,

      // 10 minute delay by default
      postponeDelay: 10 * 60 * 1000,

      init() {
        let [ ids ] = this.args;

        let tasks = ids.map(topic_id =>
          N.queue.blog_comments_search_update_by_entry(topic_id)
        );

        tasks.unshift(N.queue.blog_entries_search_update_by_ids(ids));

        return tasks;
      }
    });


    // Task to index comments from a selected blog entry (only used internally)
    //
    N.queue.registerTask({
      name: 'blog_comments_search_update_by_entry',
      pool: 'hard',
      baseClass: Queue.IteratorTemplate,
      taskID: () => 'blog_comments_search_update_by_entry',

      async iterate(state) {
        let active_chunks = this.children_created - this.children_finished;


        // Idle if we still have more than `CHUNKS_MIN_COUNT` chunks
        //
        if (active_chunks >= CHUNKS_MIN_COUNT) return {};


        // Fetch posts _id
        //
        let query = N.models.blogs.BlogComment.find()
                        .where('entry').equals(this.args[0])
                        .select('_id')
                        .sort({ _id: -1 })
                        .limit(POSTS_PER_CHUNK * CHUNKS_TO_ADD)
                        .lean(true);

        // If state is present it is always smaller than max _id
        if (state) {
          query.where('_id').lt(state);
        }

        let posts = await query;


        // Check finished
        //
        if (!posts.length) return null;


        // Add chunks
        //
        let chunks = _.chunk(posts.map(p => String(p._id)), POSTS_PER_CHUNK)
                      .map(ids => N.queue.blog_comments_search_update_by_ids(ids));

        return {
          tasks: chunks,
          state: String(posts[posts.length - 1]._id)
        };
      }
    });
  });
};
