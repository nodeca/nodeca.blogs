// Combined task for rebuilding blogs (entries + comments)
//
'use strict';

const Queue = require('idoit');


module.exports = function (N) {
  N.wire.on('init:jobs', function register_blogs_rebuild() {

    N.queue.registerTask({
      name: 'blogs_rebuild',
      pool: 'hard',
      baseClass: Queue.ChainTemplate,

      // static id to make sure it will never be executed twice at the same time
      taskID: () => 'blogs_rebuild',

      init() {
        return [
          N.queue.blog_entries_rebuild(),
          N.queue.blog_comments_rebuild()
        ];
      }
    });


    N.queue.on('task:progress:blogs_rebuild', function (task_info) {
      N.live.debounce('admin.core.rebuild.blogs', {
        uid:     task_info.uid,
        current: task_info.progress,
        total:   task_info.total
      });
    });


    N.queue.on('task:end:blogs_rebuild', function (task_info) {
      N.live.emit('admin.core.rebuild.blogs', {
        uid:      task_info.uid,
        finished: true
      });
    });
  });
};
