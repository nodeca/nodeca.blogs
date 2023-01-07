// Edit blog entry
//
// data:
//
// - user_hid
// - entry_hid
// - entry_title
// - entry_id
//
'use strict';

const _ = require('lodash');


let options;
let entry;
let tags;
let $footer;


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


// Fetch entry and options
//
N.wire.before(module.apiPath + ':begin', async function fetch_options(data) {
  const entryData = await N.io.rpc('blogs.entry.edit.index', { entry_id: data.entry_id });

  const opt = await N.io.rpc('blogs.entry.options');

  options = {
    parse_options: opt.parse_options,
    user_settings: {
      no_mlinks:         !entryData.params.link_to_title && !entryData.params.link_to_snippet,
      no_emojis:         !entryData.params.emoji,
      no_quote_collapse: !entryData.params.quote_collapse,
      breaks:            !!entryData.params.breaks
    }
  };

  entry = {
    user_id:     entryData.user_id,
    md:          entryData.md,
    title:       entryData.title,
    tags:        entryData.tags
  };
});


// Show editor and add handlers for editor events
//
N.wire.on(module.apiPath + ':begin', function show_editor(data) {
  let resolve, reject;
  let promise = new Promise((_resolve, _reject) => {
    resolve = _resolve;
    reject = _reject;
  });

  tags = entry.tags || [];

  let $editor = N.MDEdit.show({
    text: entry.md,
    // hide attachment button when moderators edit posts created by others
    // (note: editing their own posts as moderators will still show normal toolbar)
    toolbar: entry.user_id !== N.runtime.user_id ? 'as_moderator' : 'default'
  });

  updateOptions();

  $editor
    .on('show.nd.mdedit', () => {
      let title = t('edit_entry', {
        entry_title: _.escape(data.entry_title),
        entry_url: N.router.linkTo('blogs.entry', {
          user_hid:  data.user_hid,
          entry_hid: data.entry_hid
        })
      });

      $editor.find('.mdedit-header__caption').html(title);
      $editor.find('.mdedit-header').append(N.runtime.render(module.apiPath + '.title_input', { title: entry.title }));
      $editor.find('.mdedit-footer').append(N.runtime.render(module.apiPath + '.options_btn'));

      $footer = $editor.find('.mdedit__editor-footer');
      $footer.html(N.runtime.render('blogs.blocks.tags_edit_list', { tags, apiPath: module.apiPath }));
    })
    .on('submit.nd.mdedit', () => {
      $editor.find('.mdedit-btn__submit').addClass('disabled');

      let params = {
        entry_id:                 data.entry_id,
        title:                    $('.blog-entry-create__title').val(),
        txt:                      N.MDEdit.text(),
        tags,
        option_no_mlinks:         options.user_settings.no_mlinks,
        option_no_emojis:         options.user_settings.no_emojis,
        option_no_quote_collapse: options.user_settings.no_quote_collapse,
        option_breaks:            options.user_settings.breaks
      };

      N.io.rpc('blogs.entry.edit.update', params)
        .then(response => {
          if (response.warning) N.wire.emit('notify.info', response.warning);
          $footer = null;
          N.MDEdit.hide();
          resolve();
        }, err => {
          $editor.find('.mdedit-btn__submit').removeClass('disabled');
          reject(err);
        });

      return false;
    })
    .on('hidden.nd.mdedit', () => {
      // always called when editor is hidden; on submit it first calls resolve
      // and then reject is called which is doing nothing
      reject('CANCELED');
    });

  return promise;
});


// Open tag input dialog
//
N.wire.on(module.apiPath + ':tags_edit', async function show_tags_input_dlg() {
  let data = { tags };

  await N.wire.emit('blogs.blocks.tags_edit_dlg', data);

  tags = data.tags;
  $footer.html(N.runtime.render('blogs.blocks.tags_edit_list', { tags, apiPath: module.apiPath }));
});


// Open options dialog
//
N.wire.on(module.apiPath + ':options', function show_options_dlg() {
  return N.wire.emit('common.blocks.editor_options_dlg', options.user_settings)
    .then(updateOptions)
    .then(() => N.io.rpc('users.set_md_options', options.user_settings));
});
