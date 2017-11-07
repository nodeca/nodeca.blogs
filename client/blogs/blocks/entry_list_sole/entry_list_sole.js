
'use strict';

const _  = require('lodash');


N.wire.once(module.apiPath, function entry_list_sole_setup_handlers() {

  // Expand deleted or hellbanned blog entry
  //
  N.wire.on(module.apiPath + ':entry_expand', function expand(data) {
    let entryId = data.$this.data('entry-id');

    return Promise.resolve()
      .then(() => N.io.rpc('blogs.sole.list.by_ids', { entry_ids: [ entryId ] }))
      .then(res => {
        let $result = $(N.runtime.render('blogs.blocks.entry_list_sole', _.assign(res, { expand: true })));

        // TODO: reset selection state, toggle checkbox manually if needed

        return N.wire.emit('navigate.update', {
          $: $result,
          locals: res,
          $replace: data.$this.closest('.blog-entry')
        });
      });
  });


  // Delete entry handler
  //
  N.wire.on(module.apiPath + ':delete', function entry_delete(data) {
    let $entry = $('#entry' + data.$this.data('entry-hid'));
    let entry_id = $entry.data('entry-id');

    let request = {
      entry_id,
      as_moderator: data.$this.data('as-moderator') || false
    };
    let params = {
      canDeleteHard: N.runtime.page_data.settings.blogs_mod_can_hard_delete,
      asModerator: request.as_moderator
    };

    return Promise.resolve()
      .then(() => N.wire.emit('blogs.blocks.blog_entry.entry_delete_dlg', params))
      .then(() => {
        request.method = params.method;
        if (params.reason) request.reason = params.reason;
        return N.io.rpc('blogs.entry.destroy', request);
      })
      .then(() => N.io.rpc('blogs.sole.list.by_ids', { entry_ids: [ entry_id ] }))
      .then(res => {
        if (res.entries.length === 0) {
          $entry.fadeOut(function () {
            $entry.remove();
          });
          return;
        }

        let $result = $(N.runtime.render('blogs.blocks.entry_list_sole', res));

        return N.wire.emit('navigate.update', {
          $: $result,
          locals: res,
          $replace: $entry
        });
      });
  });


  // Undelete entry handler
  //
  N.wire.on(module.apiPath + ':undelete', function entry_undelete(data) {
    let $entry = $('#entry' + data.$this.data('entry-hid'));
    let entry_id = $entry.data('entry-id');

    return Promise.resolve()
      .then(() => N.io.rpc('blogs.entry.undelete', { entry_id }))
      .then(() => N.io.rpc('blogs.sole.list.by_ids', { entry_ids: [ entry_id ] }))
      .then(res => {
        let $result = $(N.runtime.render('blogs.blocks.entry_list_sole', res));

        return N.wire.emit('navigate.update', {
          $: $result,
          locals: res,
          $replace: $entry
        });
      });
  });
});
