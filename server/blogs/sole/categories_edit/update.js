// Update category list
//
'use strict';

const _ = require('lodash');


module.exports = function (N, apiPath) {

  N.validate(apiPath, {
    categories: { type: 'string', required: 'true' }
  });


  // Check auth
  //
  N.wire.before(apiPath, function check_user_auth(env) {
    if (!env.user_info.is_member) throw N.io.FORBIDDEN;
  });


  // Check permissions
  //
  N.wire.before(apiPath, async function check_permissions(env) {
    let can_create = await env.extras.settings.fetch('blogs_can_create');

    if (!can_create) throw N.io.FORBIDDEN;
  });


  // Update categories
  //
  N.wire.on(apiPath, async function update_categories(env) {
    let categories = _.uniqBy(
      env.params.categories.split(',').map(s => s.trim()),
      N.models.blogs.BlogTag.normalize
    );

    let store = N.settings.getStore('user');

    await store.set({
      blogs_categories: { value: JSON.stringify(categories) }
    }, { user_id: env.user_info.user_id });

    await N.models.blogs.BlogTag.update(
      { user: env.user_info.user_id },
      { $set: { is_category: false } },
      { multi: true }
    );

    await N.models.blogs.BlogTag.update(
      { user: env.user_info.user_id, name_lc: { $in: categories.map(N.models.blogs.BlogTag.normalize) } },
      { $set: { is_category: true } },
      { multi: true }
    );
  });
};
