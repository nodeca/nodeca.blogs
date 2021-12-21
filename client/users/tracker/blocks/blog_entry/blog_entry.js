'use strict';


N.wire.on('users.tracker.blog_entry:mark_tab_read', function mark_tab_read() {
  return N.io.rpc('blogs.mark_read', { ts: N.runtime.page_data.mark_cut_ts })
             .then(() => N.wire.emit('navigate.reload'));
});
