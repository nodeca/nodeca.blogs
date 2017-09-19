
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
});
