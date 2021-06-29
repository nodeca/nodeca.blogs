// Select list of tags owned by current user
//
'use strict';


const _ = require('lodash');


module.exports = function (N, apiPath) {
  N.validate(apiPath, {
    tag: { type: 'string', required: true }
  });


  // Check user permissions
  //
  N.wire.before(apiPath, function check_permissions(env) {
    if (!env.user_info.is_member) throw N.io.NOT_FOUND;
  });


  // Find tags and fill response
  //
  N.wire.on(apiPath, async function find_tags(env) {
    if (env.params.tag.length < 3) {
      env.res = [];
      return;
    }

    let normalized_prefix = N.models.blogs.BlogTag.normalize(env.params.tag);

    let tags = await N.models.blogs.BlogTag.find()
                         .where('user').equals(env.user_info.user_id)
                         .where('name_lc').regex(
                             new RegExp('^' + _.escapeRegExp(normalized_prefix)))
                         .sort('name_lc')
                         .limit(10)
                         .select('-_id name_lc')
                         .lean(true);

    env.res = tags.map(x => x.name_lc);
  });
};
