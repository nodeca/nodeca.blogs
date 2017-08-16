// Sanitize statuses and fields for blog tags
//
// - N
// - entries - array of models.blogs.BlogTag, or a single value
// - user_info - Object with `usergroups` array and `hb`
//
// Returns array of sanitized items. If `tags` is not array, it will be single sanitized tag instead
//
'use strict';


const _ = require('lodash');

const fields = [
  '_id',
  'hid',
  'user',
  'name',
  'is_category'
];


module.exports = async function (N, tags/*, user_info*/) {
  let res;

  if (!Array.isArray(tags)) {
    res = [ tags ];
  } else {
    res = tags.slice();
  }

  res = res.map(item => _.pick(item, fields));

  if (Array.isArray(tags)) return res;

  return res[0];
};

module.exports.fields = fields;
