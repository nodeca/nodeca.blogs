// Popup dialog to subscribe
//
// options:
//
// - subscription (will be updated after OK click)
//
'use strict';

const fromEvent = require('nodeca.core/lib/app/from_event');


let $dialog;
let params;
let result;


N.wire.once(module.apiPath, function init_handlers() {

  // Select subscription type
  //
  N.wire.on(module.apiPath + ':select', function select_type_subscription_dlg(data) {
    params.subscription = result = +data.$this.data('type');
    $dialog.modal('hide');
  });


  // Close dialog on sudden page exit (if user click back button in browser)
  //
  N.wire.on('navigate.exit', function teardown_page() {
    if ($dialog) {
      $dialog.modal('hide');
    }
  });
});


// Init dialog
//
N.wire.on(module.apiPath, async function show_subscription_dlg(options) {
  result = null;
  params = options;
  $dialog = $(N.runtime.render(module.apiPath, Object.assign({ apiPath: module.apiPath }, params)));
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
  params = null;

  if (!result) throw 'CANCELED';
});
