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
    let categories = _.uniq(env.params.categories.split(',').map(N.models.blogs.BlogTag.normalize));

    let existing_tags = await N.models.blogs.BlogTag.find()
                                  .where('user').equals(env.user_info.user_id)
                                  .lean(true);

    let existing_tags_by_name = _.keyBy(existing_tags, 'name');

    await N.models.blogs.BlogTag.update(
      { user: env.user_info.user_id },
      { $set: { is_category: false } },
      { multi: true }
    );

    for (let title of categories) {
      title = title.trim().toLowerCase().replace(/\s+/, ' ').replace(/^\s+|\s+$/g, '');

      let existing_tag = existing_tags_by_name[title];

      if (existing_tag) {
        await N.models.blogs.BlogTag.update(
          { _id: existing_tag._id },
          { is_category: true }
        );
      } else {
        await N.models.blogs.BlogTag.create({
          name: title,
          user: env.user_info.user_id,
          is_category: true
        });
      }
    }
  });


  // Fetch data to refresh tag list
  //
  N.wire.after(apiPath, async function fetch_categories(env) {
    let categories = await N.models.blogs.BlogTag.find()
                               .where('user').in(env.user_info.user_id)
                               .where('is_category').equals(true)
                               .sort('hid')
                               .lean(true);

    env.res.tag_hids = _.map(categories, 'hid');
    env.res.tags = _.keyBy(categories.map(tag => _.pick(tag, [
      '_id', 'hid', 'user', 'name', 'is_category'
    ])), 'hid');

    env.data.users = env.data.users || [];
    env.data.users.push(env.user_info.user_id);
  });
};
