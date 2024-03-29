'use strict';


N.wire.once(module.apiPath, function blog_entry_setup_handlers() {

  // Click report button
  //
  N.wire.on(module.apiPath + ':report', async function entry_report(data) {
    let params = { messages: t('@blogs.abuse_report.messages') };
    let id = data.$this.data('entry-id');

    await N.wire.emit('common.blocks.abuse_report_dlg', params);
    await N.io.rpc('blogs.entry.abuse_report', { entry_id: id, message: params.message });
    await N.wire.emit('notify.info', t('abuse_reported'));
  });


  // Show blog entry IP
  //
  N.wire.on(module.apiPath + ':show_ip', async function entry_show_ip(data) {
    await N.wire.emit('blogs.blocks.ip_info_dlg', { entry_id: data.$this.data('entry-id') });
  });


  // Add/remove bookmark
  //
  N.wire.on(module.apiPath + ':bookmark', async function entry_bookmark(data) {
    let $entry   = $('#entry' + data.$this.data('entry-hid'));
    let entry_id = $entry.data('entry-id');
    let remove   = data.$this.data('remove') || false;

    const res = await N.io.rpc('blogs.entry.bookmark', { entry_id, remove });

    if (remove) $entry.removeClass('blog-entry__m-bookmarked');
    else $entry.addClass('blog-entry__m-bookmarked');

    $entry.find('.blog-entry__bookmarks-count').attr('data-bm-count', res.count);
  });


  // Show history popup
  //
  N.wire.on(module.apiPath + ':history', async function entry_history(data) {
    let entry_id = data.$this.data('entry-id');

    const res = await N.io.rpc('blogs.entry.show_history', { entry_id });
    await N.wire.emit('blogs.blocks.blog_entry.entry_history_dlg', res);
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
