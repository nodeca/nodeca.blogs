// Add a widget displaying blog rebuild progress (entries + comments)
//
'use strict';


module.exports = function (N) {
  N.wire.after('server:admin.core.rebuild', { priority: 40 }, async function rebuild_blogs_widget(env) {
    let task = await N.queue.getTask('blogs_rebuild');
    let task_info = {};

    if (task && task.state !== 'finished') {
      task_info = {
        current: task.progress,
        total:   task.total
      };
    }

    env.res.blocks.push({ name: 'blogs', task_info });
  });
};
