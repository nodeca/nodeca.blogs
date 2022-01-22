'use strict';


N.wire.on('navigate.done:' + module.apiPath, async function unsubscribe() {
  let selector = '.blogs-sole-unsubscribe';
  let type = $(selector).data('type');
  let user_id = $(selector).data('user-id');

  await N.io.rpc('blogs.sole.change_subscription', { user_id, type });
  $(selector).addClass('page-loading__m-done');
});
