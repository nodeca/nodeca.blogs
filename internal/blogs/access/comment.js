// Check comment permissions
//
// In:
//
// - params.comments - array of models.blogs.BlogComment. Could be plain value
// - params.user_info - user id or Object with `usergroups` array
// - params.preload - array of comments or entries (used as a cache)
// - data - cache + result
// - cache - object of `id => entry or comment`, only used internally
//
// Out:
//
// - data.access_read - array of boolean. If `params.comments` is not array - will be plain boolean
//

'use strict';


const _        = require('lodash');
const ObjectId = require('mongoose').Types.ObjectId;
const userInfo = require('nodeca.users/lib/user_info');


module.exports = function (N, apiPath) {

  //////////////////////////////////////////////////////////////////////////
  // Hook for the "get permissions by url" feature, used in snippets
  //
  N.wire.on('internal:common.access', async function check_blog_comment_access(access_env) {
    let match = N.router.matchAll(access_env.params.url).reduce(
      (acc, match) => (match.meta.methods.get === 'blogs.entry' ? match : acc),
      null
    );

    if (!match) return;

    let comment_hid, m;

    if (match.params.$anchor && (m = match.params.$anchor.match(/^comment(\d+)$/))) {
      comment_hid = Number(m[1]);
    }

    if (!comment_hid) return;

    let entry = await N.models.blogs.BlogEntry.findOne()
                          .where('hid').equals(match.params.entry_hid)
                          .lean(true);

    if (!entry) return;

    let comment = await N.models.blogs.BlogComment.findOne()
                            .where('entry').equals(entry._id)
                            .where('hid').equals(comment_hid)
                            .lean(true);

    if (!comment) return;

    let access_env_sub = {
      params: {
        comments: comment,
        user_info: access_env.params.user_info,
        preload: [ entry ]
      }
    };

    await N.wire.emit('internal:blogs.access.comment', access_env_sub);

    access_env.data.access_read = access_env_sub.data.access_read;
  });


  /////////////////////////////////////////////////////////////////////////////
  // Initialize return value for data.access_read
  //
  N.wire.before(apiPath, { priority: -100 }, function init_access_read(locals) {
    locals.data = locals.data || {};

    let comments = Array.isArray(locals.params.comments) ?
                   locals.params.comments :
                   [ locals.params.comments ];

    locals.data.comment_ids = comments.map(comment => comment._id);

    // fill in cache
    locals.cache = locals.cache || {};

    comments.forEach(comment => { locals.cache[comment._id] = comment; });

    (locals.params.preload || []).forEach(object => { locals.cache[object._id] = object; });

    // initialize access_read, remove comments that's not found in cache
    locals.data.access_read = locals.data.comment_ids.map(id => {
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


  // Fetch blog entries for all comments into cache
  //
  N.wire.before(apiPath, async function fetch_entries(locals) {
    // select all entry ids that belong to comments we need to check access to
    let ids = locals.data.comment_ids
                  .filter((__, i) => locals.data.access_read[i] !== false)
                  .map(id => locals.cache[id].entry)
                  .filter(id => !locals.cache[id]);

    if (!ids.length) return;

    let result = await N.models.blogs.BlogEntry.find()
                           .where('_id').in(ids)
                           .lean(true);

    if (!result) return;

    result.forEach(topic => {
      locals.cache[topic._id] = topic;
    });
  });


  // Check blog entry permissions
  //
  N.wire.before(apiPath, async function check_entries(locals) {
    let entries = _.uniq(
      locals.data.comment_ids
          .filter((__, i) => locals.data.access_read[i] !== false)
          .map(id => String(locals.cache[id].entry))
    ).map(entry_id => locals.cache[entry_id]);

    let access_env = {
      params: { entries, user_info: locals.data.user_info },
      cache: locals.cache
    };
    await N.wire.emit('internal:blogs.access.entry', access_env);

    // entry_id -> access
    let entries_access = {};

    entries.forEach((entry, i) => {
      entries_access[entry._id] = access_env.data.access_read[i];
    });

    locals.data.comment_ids.forEach((id, i) => {
      if (!entries_access[locals.cache[id].entry]) locals.data.access_read[i] = false;
    });
  });


  // Check blog comment permissions
  //
  N.wire.on(apiPath, async function check_comment_access(locals) {
    let statuses = N.models.blogs.BlogComment.statuses;
    let params = {
      user_id: locals.data.user_info.user_id,
      usergroup_ids: locals.data.user_info.usergroups
    };

    let can_see_hellbanned = await N.settings.get('can_see_hellbanned', params, {});

    locals.data.comment_ids.forEach((id, i) => {
      if (locals.data.access_read[i] === false) return; // continue

      let comment = locals.cache[id];

      let allow_access = (comment.st === statuses.VISIBLE || comment.ste === statuses.VISIBLE);

      if (comment.st === statuses.HB) {
        allow_access = allow_access && (locals.data.user_info.hb || can_see_hellbanned);
      }

      if (!allow_access) {
        locals.data.access_read[i] = false;
      }
    });
  });


  // If no function reported error at this point, allow access
  //
  N.wire.after(apiPath, { priority: 100 }, function allow_read(locals) {
    locals.data.access_read = locals.data.access_read.map(val => val !== false);

    // If `params.comments` is not array - `data.access_read` should be also not an array
    if (!_.isArray(locals.params.comments)) {
      locals.data.access_read = locals.data.access_read[0];
    }
  });
};
