// Sanitize statuses and fields for blog entries
//
// - N
// - entries - array of models.blogs.BlogEntry, or a single value
// - user_info - Object with `usergroups` array and `hb`
//
// Returns array of sanitized items. If `entries` is not array, it will be single sanitized entry instead
//
'use strict';


const _ = require('lodash');

const fields = [
  '_id',
  'hid',
  'title',
  'html',
  'user',
  'ts',
  'st',
  'ste',
  'comments',
  'comments_hb',
  'views',
  'bookmarks',
  'tag_hids',
  'tail'
];


module.exports = async function (N, entries, user_info) {
  let res;

  if (!Array.isArray(entries)) {
    res = [ entries ];
  } else {
    res = entries.slice();
  }

  res = res.map(item => _.pick(item, fields));

  let params = {
    user_id: user_info.user_id,
    usergroup_ids: user_info.usergroups
  };

  let can_see_hellbanned = await N.settings.get('can_see_hellbanned', params, {});

  res = res.map(item => {
    if (item.st === N.models.blogs.BlogEntry.statuses.HB && !can_see_hellbanned) {
      item.st = item.ste;
      delete item.ste;
    }

    if (typeof item.comments_hb !== 'undefined' && (user_info.hb || can_see_hellbanned)) {
      item.comments = item.comments_hb;
    }
    delete item.cache_hb;

    return item;
  });

  if (Array.isArray(entries)) return res;

  return res[0];
};

module.exports.fields = fields;
