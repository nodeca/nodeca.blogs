
'use strict';


N.wire.once(module.apiPath, function entry_list_sole_setup_handlers() {

  // Expand preview when user clicks on "read more" button
  //
  N.wire.on(module.apiPath + ':entry_read_more', async function expand_preview(data) {
    let entry_id = data.$this.data('entry-id');

    const res = await N.io.rpc('blogs.entry.get', { entry_id });

    let old_content = data.$this.closest('.blog-entry').find('.blog-entry__message');

    data.$this.closest('.blog-entry').removeClass('blog-entry__m-can-read-more');

    let $html = $(res.entry.html.replace('<!--cut', '<span class="tmp-cut-marker"></span><!--cut'));
    let new_content = $('<div class="blog-entry__message markup"></div>');

    // top_level_tag is last visible paragraph on screen before expansion
    let top_level_tag = $html.find('.tmp-cut-marker');
    while (top_level_tag.parent().length) top_level_tag = top_level_tag.parent();

    // add a class to everything below the cut
    top_level_tag.nextAll().addClass('blog-entry__under-cut');

    $html.remove('.blog-entry__tmp-cut-marker');

    new_content.append($html);

    // replace old content with expanded blog post, part after cut has 0 opacity
    // initially and animates to 1 later
    await N.wire.emit('navigate.content_update', {
      $: new_content,
      locals: res,
      $replace: old_content
    });
  });


  // Expand deleted or hellbanned blog entry
  //
  N.wire.on(module.apiPath + ':entry_expand', async function expand(data) {
    let entryId = data.$this.data('entry-id');

    const res = await N.io.rpc('blogs.sole.list.by_ids', { entry_ids: [ entryId ] });

    let $result = $(N.runtime.render('blogs.blocks.entry_list_sole', Object.assign(res, { expand: true })));

    // TODO: reset selection state, toggle checkbox manually if needed

    await N.wire.emit('navigate.content_update', {
      $: $result,
      locals: res,
      $replace: data.$this.closest('.blog-entry')
    });
  });


  // Add infraction for blog entry
  //
  N.wire.on(module.apiPath + ':add_infraction', async function add_infraction(data) {
    let $entry = $('#entry' + data.$this.data('entry-hid'));
    let entry_id = $entry.data('entry-id');
    let params = { entry_id };

    await N.wire.emit('common.blocks.add_infraction_dlg', params);
    await N.io.rpc('blogs.entry.add_infraction', params);
    const res = await N.io.rpc('blogs.sole.list.by_ids', { entry_ids: [ entry_id ] });

    let $result = $(N.runtime.render('blogs.blocks.entry_list_sole', res));

    await N.wire.emit('navigate.content_update', {
      $: $result,
      locals: res,
      $replace: $entry
    });

    await N.wire.emit('notify.info', t('infraction_added'));
  });


  // Edit entry handler
  //
  N.wire.on(module.apiPath + ':edit', async function edit(data) {
    let $entry = $('#entry' + data.$this.data('entry-hid'));
    let entry_id = $entry.data('entry-id');

    await N.wire.emit('blogs.blocks.blog_entry.edit:begin', {
      user_hid:    $entry.data('user-hid'),
      entry_hid:   $entry.data('entry-hid'),
      entry_title: $entry.find('.blog-entry__title').text(),
      entry_id
    });

    const res = await N.io.rpc('blogs.sole.list.by_ids', { entry_ids: [ entry_id ] });

    let $result = $(N.runtime.render('blogs.blocks.entry_list_sole', res));

    await N.wire.emit('navigate.content_update', {
      $: $result,
      locals: res,
      $replace: $entry
    });
  });


  // Delete entry handler
  //
  N.wire.on(module.apiPath + ':delete', async function entry_delete(data) {
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

    await N.wire.emit('blogs.blocks.blog_entry.entry_delete_dlg', params);

    request.method = params.method;
    if (params.reason) request.reason = params.reason;

    await N.io.rpc('blogs.entry.destroy', request);

    const res = await N.io.rpc('blogs.sole.list.by_ids', { entry_ids: [ entry_id ] });

    if (res.entries.length === 0) {
      $entry.fadeOut(function () {
        $entry.remove();
      });
      return;
    }

    let $result = $(N.runtime.render('blogs.blocks.entry_list_sole', res));

    await N.wire.emit('navigate.content_update', {
      $: $result,
      locals: res,
      $replace: $entry
    });
  });


  // Undelete entry handler
  //
  N.wire.on(module.apiPath + ':undelete', async function entry_undelete(data) {
    let $entry = $('#entry' + data.$this.data('entry-hid'));
    let entry_id = $entry.data('entry-id');

    await N.io.rpc('blogs.entry.undelete', { entry_id });
    const res = await N.io.rpc('blogs.sole.list.by_ids', { entry_ids: [ entry_id ] });

    let $result = $(N.runtime.render('blogs.blocks.entry_list_sole', res));

    await N.wire.emit('navigate.content_update', {
      $: $result,
      locals: res,
      $replace: $entry
    });
  });
});
