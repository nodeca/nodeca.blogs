// Get user activity counters for blogs
//
// Params:
//  - data.user_id (ObjectId)
//  - data.current_user_id (Object), same as env.user_info
//
// Returns:
//  - data.count (Number)
//

'use strict';


module.exports = function (N, apiPath) {

  N.wire.on(apiPath, { parallel: true }, async function activity_get_blogs(data) {
    let count = (await Promise.all([
      N.models.blogs.UserBlogEntryCount.get(data.user_id, data.current_user_info),
      N.models.blogs.UserBlogCommentCount.get(data.user_id, data.current_user_info)
    ])).reduce((a, b) => a + b, 0);

    data.count += count;
  });
};
