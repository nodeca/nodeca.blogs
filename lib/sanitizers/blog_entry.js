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
  'edit_count',
  'last_edit_ts',
  'st',
  'ste',
  'cache',
  'cache_hb',
  'views',
  'bookmarks',
  'del_reason',
  'del_by',
  'votes',
  'votes_hb'
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

  let { can_see_hellbanned, can_see_history } = await N.settings.get(
    [ 'can_see_hellbanned', 'can_see_history' ],
    params, {}
  );

  res = res.map(item => {
    if (item.st === N.models.blogs.BlogEntry.statuses.HB && !can_see_hellbanned) {
      item.st = item.ste;
      delete item.ste;
    }

    if (typeof item.cache_hb !== 'undefined' && (user_info.hb || can_see_hellbanned)) {
      item.cache = item.cache_hb;
    }
    delete item.cache_hb;

    if (typeof item.votes_hb !== 'undefined' && (user_info.hb || can_see_hellbanned)) {
      item.votes = item.votes_hb;
    }
    delete item.votes_hb;

    if (!can_see_history) {
      delete item.edit_count;
      delete item.last_edit_ts;
    }

    return item;
  });

  if (Array.isArray(entries)) return res;

  return res[0];
};

module.exports.fields = fields;
