'use strict';


N.wire.once('navigate.done:' + module.apiPath, function page_once() {

  // Edit subscription button handler
  //
  N.wire.on(module.apiPath + ':edit', function edit_subscription(data) {
    let user_id = data.$this.data('user-id');
    let params = { subscription: data.$this.data('subscription') };

    return Promise.resolve()
      .then(() => N.wire.emit('blogs.sole.subscription', params))
      .then(() => N.io.rpc('blogs.sole.subscribe', { user_id, type: params.subscription }))
      .then(() => {
        data.$this.replaceWith(
          N.runtime.render(module.apiPath + '.button', { user_id, subscription: params.subscription })
        );
      });
  });
});
