
'use strict';


N.wire.once(module.apiPath, function blog_entry_setup_handlers() {

  // Click report button
  //
  N.wire.on(module.apiPath + ':report', function entry_report(data) {
    let params = { messages: t('@blogs.abuse_report.messages') };
    let id = data.$this.data('entry-id');

    return Promise.resolve()
      .then(() => N.wire.emit('common.blocks.abuse_report_dlg', params))
      .then(() => N.io.rpc('blogs.entry.abuse_report', { entry_id: id, message: params.message }))
      .then(() => N.wire.emit('notify.info', t('abuse_reported')));
  });


  // Show blog entry IP
  //
  N.wire.on(module.apiPath + ':show_ip', function entry_show_ip(data) {
    return N.wire.emit('blogs.blocks.ip_info_dlg', { entry_id: data.$this.data('entry-id') });
  });


  // Delete entry handler
  //
  N.wire.on(module.apiPath + ':delete', function entry_delete(data) {
    let entry_id = data.$this.data('entry-id');

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
      .then(() =>
        // TODO: move to user blog if we're on the blog page, fade otherwise
        N.wire.emit('navigate.reload')
      );
  });


  // Undelete entry handler
  //
  N.wire.on(module.apiPath + ':undelete', function entry_undelete(data) {
    let entry_id = data.$this.data('entry-id');

    return Promise.resolve()
      .then(() => N.io.rpc('blogs.entry.undelete', { entry_id }))
      .then(() =>
        // TODO: toggle deletion status better
        N.wire.emit('navigate.reload')
      );
  });


  // Add/remove bookmark
  //
  N.wire.on(module.apiPath + ':bookmark', function entry_bookmark(data) {
    let id     = data.$this.data('entry-id');
    let remove = data.$this.data('remove') || false;
    let $entry = data.$this.closest('.blog-entry');

    return N.io.rpc('blogs.entry.bookmark', { entry_id: id, remove }).then(res => {
      if (remove) {
        $entry.removeClass('blog-entry__m-bookmarked');
      } else {
        $entry.addClass('blog-entry__m-bookmarked');
      }

      $entry.find('.blog-entry__bookmarks-count').attr('data-bm-count', res.count);
    });
  });


  // Show history popup
  //
  N.wire.on(module.apiPath + ':history', function entry_history(data) {
    let entry_id = data.$this.data('entry-id');

    return Promise.resolve()
      .then(() => N.io.rpc('blogs.entry.show_history', { entry_id }))
      .then(res => N.wire.emit('blogs.blocks.blog_entry.entry_history_dlg', res));
  });


  // When user clicks "create dialog" button in usercard popup,
  // add title & link to editor.
  //
  N.wire.before('users.dialog.create:begin', function dialog_create_extend_blog_entries(params) {
    if (!params || !params.ref) return; // no data to extend
    if (!/^blog_entry:/.test(params.ref)) return; // not our data

    let [ , user_hid, entry_hid ] = params.ref.split(':');
    let title = $(`#entry${entry_hid} .blog-entry__title`).text();
    let href  = N.router.linkTo('blogs.entry', { user_hid, entry_hid });

    if (title && href) {
      params.text = `Re: [${title}](${href})\n\n`;
    }
  });
});
