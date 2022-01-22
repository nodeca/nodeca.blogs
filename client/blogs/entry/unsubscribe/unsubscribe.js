'use strict';


N.wire.on('navigate.done:' + module.apiPath, async function unsubscribe() {
  let selector = '.blogs-entry-unsubscribe';
  let type = $(selector).data('type');
  let entry_id = $(selector).data('entry-id');

  await N.io.rpc('blogs.entry.change_subscription', { entry_id, type });

  $(selector).addClass('page-loading__m-done');
});
