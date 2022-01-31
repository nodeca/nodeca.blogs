// Edit categories
//
'use strict';

const fromEvent = require('nodeca.core/lib/app/from_event');


let $dialog;
let categories;
let result;


// Fetch categories
//
N.wire.before(module.apiPath, function fetch_categories() {
  return N.io.rpc('blogs.sole.categories_edit.index').then(res => {
    result = null;
    categories = res;
  });
});


// Init dialog
//
N.wire.on(module.apiPath, async function show_dialog() {
  $dialog = $(N.runtime.render(module.apiPath, Object.assign({ apiPath: module.apiPath }, categories)));
  $('body').append($dialog);

  $dialog
    .on('shown.bs.modal', function () {
      $dialog.find('.btn-secondary').focus();
    })
    .modal('show');

  await fromEvent($dialog, 'hidden.bs.modal');

  // When dialog closes - remove it from body and free resources.
  $dialog.remove();
  $dialog = null;

  if (!result) throw 'CANCELED';

  await N.io.rpc('blogs.sole.categories_edit.update', {
    categories: result.categories
  });

  await N.wire.emit('notify.info', t('category_list_update_done'));
  // we need to update tags in the header and tags in all blog posts,
  // so full reload is necessary there
  N.wire.emit('navigate.reload');
});


// Submit button handler
//
N.wire.on(module.apiPath + ':submit', function submit_dialog(data) {
  result = data.fields;
  $dialog.modal('hide');
});


// Close dialog on sudden page exit (if user click back button in browser)
//
N.wire.on('navigate.exit', function teardown_page() {
  $dialog?.modal('hide');
});
