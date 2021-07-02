// Check blog entry permissions
//
// In:
//
// - params.entries - array of models.blogs.BlogEntry. Could be plain value
// - params.user_info - user id or Object with `usergroups` array
// - params.preload - array of comments or entries (used as a cache)
// - data - cache + result
// - cache - object of `id => entry or comment`, only used internally
//
// Out:
//
// - data.access_read - array of boolean. If `params.entries` is not array - will be plain boolean
//

'use strict';


const ObjectId = require('mongoose').Types.ObjectId;
const userInfo = require('nodeca.users/lib/user_info');


module.exports = function (N, apiPath) {

  //////////////////////////////////////////////////////////////////////////
  // Hook for the "get permissions by url" feature, used in snippets
  //
  N.wire.on('internal:common.access', async function check_blog_entry_access(access_env) {
    let match = N.router.matchAll(access_env.params.url).reduce(
      (acc, match) => (match.meta.methods.get === 'blogs.entry' && !match.params.comment_hid ? match : acc),
      null
    );

    if (!match) return;

    if (match.params.$anchor && match.params.$anchor.match(/^comment(\d+)$/)) {
      return;
    }

    let entry = await N.models.blogs.BlogEntry.findOne()
                          .where('hid').equals(match.params.entry_hid)
                          .lean(true);

    if (!entry) return;

    let access_env_sub = {
      params: {
        entries: entry,
        user_info: access_env.params.user_info
      }
    };

    await N.wire.emit('internal:blogs.access.entry', access_env_sub);

    access_env.data.access_read = access_env_sub.data.access_read;
  });


  /////////////////////////////////////////////////////////////////////////////
  // Initialize return value for data.access_read
  //
  N.wire.before(apiPath, { priority: -100 }, function init_access_read(locals) {
    locals.data = locals.data || {};

    let entries = Array.isArray(locals.params.entries) ?
                  locals.params.entries :
                  [ locals.params.entries ];

    locals.data.entry_ids = entries.map(entry => entry._id);

    // fill in cache
    locals.cache = locals.cache || {};

    entries.forEach(entry => { locals.cache[entry._id] = entry; });

    (locals.params.preload || []).forEach(object => { locals.cache[object._id] = object; });

    // initialize access_read, remove entries that's not found in cache
    locals.data.access_read = locals.data.entry_ids.map(id => {
      if (!locals.cache[id]) return false;
      return null;
    });
  });


  // Fetch user user_info if it's not present already
  //
  N.wire.before(apiPath, async function fetch_usergroups(locals) {
    if (ObjectId.isValid(String(locals.params.user_info))) {
      locals.data.user_info = await userInfo(N, locals.params.user_info);
      return;
    }

    // Use presented
    locals.data.user_info = locals.params.user_info;
  });


  // Check blog entry permissions
  //
  N.wire.on(apiPath, async function check_entry_access(locals) {
    let statuses = N.models.blogs.BlogEntry.statuses;
    let params = {
      user_id: locals.data.user_info.user_id,
      usergroup_ids: locals.data.user_info.usergroups
    };

    let setting_names = [
      'can_see_hellbanned',
      'blogs_mod_can_delete',
      'blogs_mod_can_see_hard_deleted'
    ];

    let settings = await N.settings.get(setting_names, params, {});

    locals.data.entry_ids.forEach((id, i) => {
      if (locals.data.access_read[i] === false) return; // continue

      let entry = locals.cache[id];

      let visibleSt = [ statuses.VISIBLE ];

      if (locals.data.user_info.hb || settings.can_see_hellbanned) {
        visibleSt.push(statuses.HB);
      }

      if (settings.blogs_mod_can_delete) {
        visibleSt.push(statuses.DELETED);
      }

      if (settings.blogs_mod_can_see_hard_deleted) {
        visibleSt.push(statuses.DELETED_HARD);
      }

      if (visibleSt.indexOf(entry.st) === -1) {
        locals.data.access_read[i] = false;
      }
    });
  });


  // If no function reported error at this point, allow access
  //
  N.wire.after(apiPath, { priority: 100 }, function allow_read(locals) {
    locals.data.access_read = locals.data.access_read.map(val => val !== false);

    // If `params.entries` is not array - `data.access_read` should be also not an array
    if (!Array.isArray(locals.params.entries)) {
      locals.data.access_read = locals.data.access_read[0];
    }
  });
};
