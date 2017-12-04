// Get category list
//
'use strict';


module.exports = function (N, apiPath) {

  N.validate(apiPath, {});


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


  // Fill category data
  //
  N.wire.on(apiPath, async function fill_data(env) {
    env.res.categories = await N.models.blogs.BlogTag.find()
                                   .where('user').equals(env.user_info.user_id)
                                   .where('is_category').equals(true)
                                   .sort('hid')
                                   .lean(true);
  });
};
