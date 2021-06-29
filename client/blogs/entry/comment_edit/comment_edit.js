// Edit blog comment
//
// data:
//
// - user_hid
// - entry_hid
// - entry_title
// - comment_hid
// - comment_id
//
'use strict';

const _ = require('lodash');


let options;
let comment;


function updateOptions() {
  N.MDEdit.parseOptions(Object.assign({}, options.parse_options, {
    link_to_title:   options.user_settings.no_mlinks         ? false : options.parse_options.link_to_title,
    link_to_snippet: options.user_settings.no_mlinks         ? false : options.parse_options.link_to_snippet,
    quote_collapse:  options.user_settings.no_quote_collapse ? false : options.parse_options.quote_collapse,
    emoji:           options.user_settings.no_emojis         ? false : options.parse_options.emoji
  }));
}


// Load mdedit
//
N.wire.before(module.apiPath + ':begin', function load_mdedit() {
  return N.loader.loadAssets('mdedit');
});


// Fetch comment and options
//
N.wire.before(module.apiPath + ':begin', function fetch_options(data) {
  let commentData;

  return Promise.resolve()
    .then(() => N.io.rpc('blogs.entry.comment.edit.index', { comment_id: data.comment_id }))
    .then(response => {
      commentData = response;

      return N.io.rpc('blogs.entry.comment.options');
    })
    .then(opt => {
      options = {
        parse_options: opt.parse_options,
        user_settings: {
          no_mlinks:         !commentData.params.link_to_title && !commentData.params.link_to_snippet,
          no_emojis:         !commentData.params.emoji,
          no_quote_collapse: !commentData.params.quote_collapse
        }
      };

      comment = {
        user_id:     commentData.user_id,
        md:          commentData.md,
        title:       commentData.title
      };
    });
});


// Show editor and add handlers for editor events
//
N.wire.on(module.apiPath + ':begin', function show_editor(data) {
  let $editor = N.MDEdit.show({
    text: comment.md,
    // hide attachment button when moderators edit posts created by others
    // (note: editing their own posts as moderators will still show normal toolbar)
    toolbar: comment.user_id !== N.runtime.user_id ? 'as_moderator' : 'default'
  });

  updateOptions();

  $editor
    .on('show.nd.mdedit', () => {
      let title = t('edit_comment', {
        entry_title: _.escape(data.entry_title),
        comment_url: N.router.linkTo('blogs.entry', {
          user_hid:  data.user_hid,
          entry_hid: data.entry_hid,
          $anchor:   `comment${data.comment_hid}`
        }),
        comment_hid: _.escape(data.comment_hid)
      });

      $editor.find('.mdedit-header__caption').html(title);
      $editor.find('.mdedit-footer').append(N.runtime.render(module.apiPath + '.options_btn'));
    })
    .on('submit.nd.mdedit', () => {
      $editor.find('.mdedit-btn__submit').addClass('disabled');

      let params = {
        comment_id:               data.comment_id,
        txt:                      N.MDEdit.text(),
        option_no_mlinks:         options.user_settings.no_mlinks,
        option_no_emojis:         options.user_settings.no_emojis,
        option_no_quote_collapse: options.user_settings.no_quote_collapse
      };

      let $comment = $('#comment' + data.comment_hid);

      N.io.rpc('blogs.entry.comment.edit.update', params)
        .then(() => N.io.rpc('blogs.entry.comment.get', {
          entry_hid: data.entry_hid,
          comment_ids: [ $comment.data('comment-id') ]
        }))
        .then(res => {
          N.MDEdit.hide();

          let $result = $(N.runtime.render('blogs.entry.blocks.comment_list', res));

          return N.wire.emit('navigate.content_update', {
            $: $result,
            locals: res,
            $replace: $comment
          });
        })
        .catch(err => {
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
