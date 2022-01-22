// Popup dialog to delete blog entry
//
// options:
//
// - asModerator
// - canDeleteHard
// - method - out. 'hard' or 'soft'
// - reason - out
//
'use strict';

const fromEvent = require('nodeca.core/lib/system/from_event');

let $dialog;
let params;
let result;


N.wire.once(module.apiPath, function init_handlers() {

  // Submit button handler
  //
  N.wire.on(module.apiPath + ':submit', function submit_entry_delete_dlg(form) {
    params.method = form.fields.method || 'soft';
    if ($.trim(form.fields.reason) !== '') {
      params.reason = form.fields.reason;
    }

    result = params;
    $dialog.modal('hide');
  });


  // Close dialog on sudden page exit (if user click back button in browser)
  //
  N.wire.on('navigate.exit', function teardown_page() {
    $dialog?.modal('hide');
  });
});


// Init dialog
//
N.wire.on(module.apiPath, async function show_entry_delete_dlg(options) {
  result = null;
  params = options;
  $dialog = $(N.runtime.render(module.apiPath, params));

  $('body').append($dialog);

  $dialog
    .on('shown.bs.modal', () => $dialog.find('.btn-secondary').focus())
    .modal('show');

  await fromEvent($dialog, 'hidden.bs.modal');

  // When dialog closes - remove it from body and free resources
  $dialog.remove();
  $dialog = null;
  params = null;

  if (!result) throw ('CANCELED');
});
