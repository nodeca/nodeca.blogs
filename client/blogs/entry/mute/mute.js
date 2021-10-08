'use strict';


N.wire.on('navigate.done:' + module.apiPath, function unsubscribe() {
  let selector = '.blogs-entry-mute';
  let type = $(selector).data('type');
  let entry_id = $(selector).data('entry-id');

  return Promise.resolve()
           .then(() => N.io.rpc('blogs.entry.change_subscription', { entry_id, type }))
           .then(() => $(selector).addClass('page-loading__m-done'));
});
