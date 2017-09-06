// Sanitize statuses and fields for blog comments
//
// - N
// - comments - array of models.blogs.BlogComment, or a single value
// - user_info - Object with `usergroups` array and `hb`
//
// Returns array of sanitized items. If `comments` is not array, it will be single sanitized comment instead
//
'use strict';


const _ = require('lodash');

const fields = [
  '_id',
  'hid',
  'html',
  'user',
  'ts',
  'path',
  'tail'
];


module.exports = async function (N, comments, user_info) {
  let res;

  if (!Array.isArray(comments)) {
    res = [ comments ];
  } else {
    res = comments.slice();
  }

  res = res.map(item => _.pick(item, fields));

  let params = {
    user_id: user_info.user_id,
    usergroup_ids: user_info.usergroups
  };

  let can_see_hellbanned = await N.settings.get('can_see_hellbanned', params, {});

  res = res.map(item => {
    if (item.st === N.models.blogs.BlogComment.statuses.HB && !can_see_hellbanned) {
      item.st = item.ste;
      delete item.ste;
    }

    return item;
  });

  if (Array.isArray(comments)) return res;

  return res[0];
};

module.exports.fields = fields;