'use strict';


N.wire.once('navigate.done:' + module.apiPath, function page_once() {

  // Edit subscription button handler
  //
  N.wire.on(module.apiPath + ':edit', function edit_subscription(data) {
    let entry_id = data.$this.data('entry-id');
    let params = { subscription: data.$this.data('subscription') };

    return Promise.resolve()
      .then(() => N.wire.emit('blogs.entry.subscription', params))
      .then(() => N.io.rpc('blogs.entry.subscribe', { entry_id, type: params.subscription }))
      .then(() => {
        data.$this.replaceWith(
          N.runtime.render(module.apiPath + '.button', { entry: { _id: entry_id }, subscription: params.subscription })
        );
      });
  });
});
