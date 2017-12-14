// Add tasks to run during reindex
//

'use strict';


module.exports = function (N) {
  N.wire.on('internal:search.reindex.tasklist', function reindex_add_blog_tasks(locals) {
    locals.push('blog_entries_search_rebuild');
    locals.push('blog_comments_search_rebuild');
  });
};
