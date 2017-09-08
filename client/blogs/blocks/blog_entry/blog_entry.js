
'use strict';


N.wire.once(module.apiPath, function blog_entry_setup_handlers() {

  // Click report button
  //
  N.wire.on(module.apiPath + ':report', function report(data) {
    let params = { messages: t('@blogs.abuse_report.messages') };
    let id = data.$this.data('entry-id');

    return Promise.resolve()
      .then(() => N.wire.emit('common.blocks.abuse_report_dlg', params))
      .then(() => N.io.rpc('blogs.entry.abuse_report', { entry_id: id, message: params.message }))
      .then(() => N.wire.emit('notify.info', t('abuse_reported')));
  });


  // Show blog entry IP
  //
  N.wire.on(module.apiPath + ':show_ip', function blog_entry_show_ip(data) {
    return N.wire.emit('blogs.blocks.ip_info_dlg', { entry_id: data.$this.data('entry-id') });
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


  // Extend dialogs create (add title & link when available)
  //
  N.wire.before('users.dialog.create:begin', function dialog_create_extend(params) {
    if (!params.ref) return; // no data to extend
    if (!/^blog_entry:/.test(params.ref)) return; // not our data

    let [ , user_hid, entry_hid ] = params.ref.split(':');
    let title = $(`#entry${entry_hid} .blog-entry__title`).text();
    let href  = N.router.linkTo('blogs.entry', { user_hid, entry_hid });

    if (title && href) {
      params.title = `Re: ${title}`;
      params.text = `${href}\n\n`;
    }
  });
});
