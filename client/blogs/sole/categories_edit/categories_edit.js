// Edit categories
//
'use strict';


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
N.wire.on(module.apiPath, function show_dialog() {
  $dialog = $(N.runtime.render(module.apiPath, Object.assign({ apiPath: module.apiPath }, categories)));
  $('body').append($dialog);

  return new Promise((resolve, reject) => {
    $dialog
      .on('shown.bs.modal', function () {
        $dialog.find('.btn-secondary').focus();
      })
      .on('hidden.bs.modal', function () {
        // When dialog closes - remove it from body and free resources.
        $dialog.remove();
        $dialog = null;

        if (!result) return reject('CANCELED');

        N.io.rpc('blogs.sole.categories_edit.update', {
          categories: result.categories
        }).then(() => N.wire.emit('notify.info', t('category_list_update_done')))
          // we need to update tags in the header and tags in all blog posts,
          // so full reload is necessary there
          .then(() => N.wire.emit('navigate.reload'))
          .then(resolve, reject);
      })
      .modal('show');
  });
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
  if ($dialog) {
    $dialog.modal('hide');
  }
});
