
'use strict';


N.wire.once([ 'navigate.done:blogs.index', 'navigate.done:blogs.sole' ], function blog_entry_setup_handlers() {

  // Click report button
  //
  N.wire.on(module.apiPath + ':report', function report(data) {
    let params = { messages: t('@blogs.abuse_report.messages') };
    let id = data.$this.data('entry-id');

    return Promise.resolve()
      .then(() => N.wire.emit('common.blocks.abuse_report_dlg', params))
      .then(() => N.io.rpc('blogs.abuse_report', { entry_id: id, message: params.message }))
      .then(() => N.wire.emit('notify.info', t('abuse_reported')));
  });


  // Show blog entry IP
  //
  N.wire.on(module.apiPath + ':show_ip', function blog_entry_show_ip(data) {
    return N.wire.emit('blogs.blocks.ip_info_dlg', { entry_id: data.$this.data('entry-id') });
  });


  // Extend dialogs create (add title & link when available)
  //
  N.wire.before('users.dialog.create:begin', function dialog_create_extend(params) {
    if (!params.ref) return; // no data to extend
    if (!/^blog_entry:/.test(params.ref)) return; // not our data

    let hid   = params.ref.split(':')[1];
    let title = $(`#entry${hid} .blog-entry__link`).text();
    let href  = $(`#entry${hid} .blog-entry__link`).attr('href');

    if (title && hid) params.title = `Re: ${title}`;
    if (href) params.text = `${href}\n\n`;
  });
});
