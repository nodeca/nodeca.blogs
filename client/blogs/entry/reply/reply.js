// Reply to entry or comment
//
// data:
//
// - user_hid - blog owner
// - entry_hid
// - entry_title
// - comment_id - optional, parent comment id
// - comment_hid - optional, parent comment hid
//
'use strict';


const _ = require('lodash');


let options;


function updateOptions() {
  N.MDEdit.parseOptions(Object.assign({}, options.parse_options, {
    link_to_title:   options.user_settings.no_mlinks         ? false : options.parse_options.link_to_title,
    link_to_snippet: options.user_settings.no_mlinks         ? false : options.parse_options.link_to_snippet,
    quote_collapse:  options.user_settings.no_quote_collapse ? false : options.parse_options.quote_collapse,
    emoji:           options.user_settings.no_emojis         ? false : options.parse_options.emoji,
    breaks:          options.user_settings.breaks            ? true  : options.parse_options.breaks
  }));
}


// Load mdedit
//
N.wire.before(module.apiPath + ':begin', function load_mdedit() {
  return N.loader.loadAssets('mdedit');
});


// Fetch options
//
N.wire.before(module.apiPath + ':begin', function fetch_options() {
  return N.io.rpc('blogs.entry.comment.options').then(opt => {
    options = {
      parse_options: opt.parse_options,
      user_settings: {
        no_mlinks:         false,
        no_emojis:         false,
        no_quote_collapse: false,
        breaks:            false
      }
    };
  });
});


// Show editor and add handlers for editor events
//
N.wire.on(module.apiPath + ':begin', function show_editor(data) {
  let $editor = N.MDEdit.show({
    draftKey: `blog_entry_reply_${N.runtime.user_hid}_${data.entry_hid}_${data.comment_id || ''}`
  });

  updateOptions();

  $editor
    .on('show.nd.mdedit', () => {
      let title = t(data.comment_hid ? 'reply_comment' : 'reply_entry', {
        entry_url: N.router.linkTo('blogs.entry', {
          user_hid:  data.user_hid,
          entry_hid: data.entry_hid
        }),
        entry_title: _.escape(data.entry_title),
        comment_url: N.router.linkTo('blogs.entry', {
          user_hid:  data.user_hid,
          entry_hid: data.entry_hid,
          $anchor:   'comment' + data.comment_hid
        }),
        comment_hid: data.comment_hid
      });

      $editor.find('.mdedit-header__caption').html(title);
      $editor.find('.mdedit-footer').append(N.runtime.render(module.apiPath + '.options_btn'));
    })
    .on('submit.nd.mdedit', () => {
      $editor.find('.mdedit-btn__submit').addClass('disabled');

      let params = {
        entry_hid:                data.entry_hid,
        txt:                      N.MDEdit.text(),
        option_no_mlinks:         options.user_settings.no_mlinks,
        option_no_emojis:         options.user_settings.no_emojis,
        option_no_quote_collapse: options.user_settings.no_quote_collapse,
        option_breaks:            options.user_settings.breaks
      };

      if (data.comment_id) {
        params.parent_comment_id = data.comment_id;
      }

      N.io.rpc('blogs.entry.comment.reply', params).then(response => {
        N.MDEdit.hide({ removeDraft: true });

        return N.wire.emit('navigate.to', {
          apiPath: 'blogs.entry',
          params: {
            user_hid:  data.user_hid,
            entry_hid: data.entry_hid
          },
          anchor: 'comment' + response.comment_hid,
          force: true
        });
      }).catch(err => {
        $editor.find('.mdedit-btn__submit').removeClass('disabled');
        N.wire.emit('error', err);
      });

      return false;
    });
});


// Open options dialog
//
N.wire.on(module.apiPath + ':options', function show_options_dlg() {
  return N.wire.emit('common.blocks.editor_options_dlg', options.user_settings).then(updateOptions);
});
