// Edit tags
//
'use strict';

const fromEvent = require('nodeca.core/lib/app/from_event');

let $dialog;
let result;
let bloodhound;


// Load dependencies
//
N.wire.before(module.apiPath, function load_deps() {
  return N.loader.loadAssets([ 'vendor.typeahead' ]);
});


// Init dialog
//
N.wire.on(module.apiPath, async function show_dialog(data) {
  const Bloodhound = require('corejs-typeahead/dist/bloodhound.js');

  result = null;
  $dialog = $(N.runtime.render(module.apiPath, Object.assign({ apiPath: module.apiPath }, data)));
  $('body').append($dialog);

  $dialog
    .on('shown.bs.modal', function () {
      // If bloodhound not initialized - init
      //
      if (!bloodhound) {
        bloodhound = new Bloodhound({
          remote: {
            url: 'unused', // bloodhound throws if it's not defined
            prepare(tag) { return tag; },
            // Reroute request to rpc
            transport(req, onSuccess, onError) {
              N.io.rpc('blogs.tag_lookup', { tag: req.url })
                .then(onSuccess)
                .catch(onError);
            }
          },
          datumTokenizer: Bloodhound.tokenizers.whitespace,
          queryTokenizer: Bloodhound.tokenizers.whitespace
        });

        bloodhound.initialize();
      }

      let bloodhound_adapter = bloodhound.ttAdapter();
      let current_tags = '';
      let current_pos  = 0;

      function extractTag(str, pos) {
        let m_before = str.slice(0, pos).match(/^(.*,\s*)?([^,]*)$/);
        let m_after  = str.slice(pos).match(/^([^,]*)(\s*,.*)?$/);

        return {
          before:  m_before[1] || '',
          current: (m_before[2] || '') + (m_after[1] + ''),
          after:   m_after[2] || ''
        };
      }

      function beforeReplace() {
        current_tags = $('.blogs-tag-edit__tags.tt-input').val();
        current_pos  = $('.blogs-tag-edit__tags.tt-input').prop('selectionStart');
      }

      function onReplace(event, data) {
        if (!data) {
          // reset to original set of tags
          $('.blogs-tag-edit__tags.tt-input').prop('selectionStart', current_pos);
          $('.blogs-tag-edit__tags.tt-input').prop('selectionEnd',   current_pos);
          return;
        }

        let existing_tags = extractTag(current_tags, current_pos);
        let new_tags      = extractTag($('.blogs-tag-edit__tags.tt-input').val(),
                            $('.blogs-tag-edit__tags.tt-input').prop('selectionStart'));
        let new_val = existing_tags.before + new_tags.current + existing_tags.after;

        if (event.type === 'typeahead:selected') {
          $('.blogs-tag-edit__tags').typeahead('val', new_val);
        } else {
          $('.blogs-tag-edit__tags.tt-input').val(new_val);
        }

        $('.blogs-tag-edit__tags.tt-input').prop('selectionStart', current_pos);
        $('.blogs-tag-edit__tags.tt-input').prop('selectionEnd',   current_pos);
      }

      // Bind typeahead to tag field
      //
      $('.blogs-tag-edit__tags').typeahead({ highlight: true }, {
        source: (query, ...args) => {
          current_tags = $('.blogs-tag-edit__tags.tt-input').val();
          current_pos  = $('.blogs-tag-edit__tags.tt-input').prop('selectionStart');

          query = extractTag(current_tags, current_pos).current;

          bloodhound_adapter.call(bloodhound, query, ...args);
        }
      })
        .on('typeahead:beforeselect', beforeReplace)
        .on('typeahead:beforecursorchange', beforeReplace)
        .on('typeahead:selected', onReplace)
        .on('typeahead:cursorchanged', onReplace);

      $dialog.find('.btn-secondary').focus();
    })
    .modal('show');

  await fromEvent($dialog, 'hidden.bs.modal');

  // When dialog closes - remove it from body and free resources.
  $dialog.remove();
  $dialog = null;

  if (!result) throw 'CANCELED';

  data.tags = result.tags.split(',').map(s => s.trim()).filter(Boolean);
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
