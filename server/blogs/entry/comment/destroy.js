// Remove blog comment by id
//

'use strict';

const _ = require('lodash');


// apply $set and $unset operations on an object
function mongo_apply(object, ops) {
  let result = Object.assign({}, object);

  for (let [ k, v ]  of Object.entries(ops)) {
    if (k === '$set') {
      Object.assign(result, v);
      continue;
    }

    if (k === '$unset') {
      for (let delete_key of Object.keys(v)) {
        delete result[delete_key];
      }
      continue;
    }

    result[k] = v;
  }

  return result;
}


module.exports = function (N, apiPath) {

  N.validate(apiPath, {
    comment_id:   { format: 'mongo', required: true },
    reason:       { type: 'string' },
    method:       { type: 'string', enum: [ 'hard', 'soft' ], required: true },
    as_moderator: { type: 'boolean', required: true }
  });


  // Fetch comment
  //
  N.wire.before(apiPath, async function fetch_comment(env) {
    env.data.comment = await N.models.blogs.BlogComment
                                 .findById(env.params.comment_id)
                                 .lean(true);

    if (!env.data.comment) throw N.io.NOT_FOUND;
  });


  // Fetch entry
  //
  N.wire.before(apiPath, async function fetch_entry(env) {
    env.data.entry = await N.models.blogs.BlogEntry
                               .findById(env.data.comment.entry)
                               .lean(true);

    if (!env.data.entry) throw N.io.NOT_FOUND;
  });


  // Check if user can see this comment
  //
  N.wire.before(apiPath, async function check_access(env) {
    let access_env = { params: {
      comments:  env.data.comment,
      user_info: env.user_info,
      preload:   [ env.data.entry ]
    } };

    await N.wire.emit('internal:blogs.access.comment', access_env);

    if (!access_env.data.access_read) throw N.io.NOT_FOUND;
  });


  // Check permissions
  //
  N.wire.before(apiPath, async function check_permissions(env) {
    // Check moderator permissions

    if (env.params.as_moderator) {
      if (env.params.method === 'soft' &&
          !(await env.extras.settings.fetch('blogs_mod_can_delete'))) {
        throw N.io.FORBIDDEN;
      }

      if (env.params.method === 'hard' &&
          !(await env.extras.settings.fetch('blogs_mod_can_hard_delete'))) {
        throw N.io.FORBIDDEN;
      }

      return;
    }

    // Check user permissions

    // Users can't hard delete anything
    if (env.params.method === 'hard') throw N.io.FORBIDDEN;

    // Check blog owner (we allow blog owner to delete anything in the blog,
    // but not comment owner)
    if (env.user_info.user_id !== String(env.data.entry.user)) {
      throw N.io.FORBIDDEN;
    }
  });


  // Remove comment
  //
  N.wire.on(apiPath, function delete_comment(env) {
    env.data.changes = env.data.changes || [];

    let statuses = N.models.blogs.BlogComment.statuses;
    let update = {
      $set: {
        st: env.params.method === 'hard' ? statuses.DELETED_HARD : statuses.DELETED,
        prev_st: _.pick(env.data.comment, [ 'st', 'ste' ]),
        del_by: env.user_info.user_id
      },
      $unset: { ste: 1 }
    };

    if (env.params.reason) {
      update.del_reason = env.params.reason;
    }

    env.data.changes.push({
      old_comment: env.data.comment,
      new_comment: mongo_apply(env.data.comment, update)
    });

    return N.models.blogs.BlogComment.updateOne({ _id: env.data.comment._id }, update);
  });


  // Remove replies
  //
  N.wire.on(apiPath, async function delete_replies(env) {
    env.data.changes = env.data.changes || [];

    let comments = await N.models.blogs.BlogComment.find()
                             .where('entry').equals(env.data.entry._id)
                             .where('path').all(env.data.comment.path.concat([ env.data.comment._id ]))
                             .lean(true);

    let bulk = N.models.blogs.BlogComment.collection.initializeUnorderedBulkOp();
    let statuses = N.models.blogs.BlogComment.statuses;

    for (let comment of comments) {
      if (env.params.method === 'hard') {
        // when hard-deleting ignore other hard-deleted posts
        if (comment.st === statuses.DELETED_HARD) continue;
      } else {
        // when deleting ignore any other deleted posts
        if (comment.st === statuses.DELETED) continue;
        if (comment.st === statuses.DELETED_HARD) continue;
      }

      let update = {
        $set: {
          st: env.params.method === 'hard' ? statuses.DELETED_HARD : statuses.DELETED,
          // if comment is already deleted (i.e. DELETED -> DELETED_HARD), keep original prev_st
          prev_st: comment.prev_st || _.pick(comment, [ 'st', 'ste' ]),
          del_by: env.user_info.user_id
        },
        $unset: { ste: 1, del_reason: 1 }
      };

      env.data.changes.push({
        old_comment: comment,
        new_comment: mongo_apply(comment, update)
      });

      bulk.find({ _id: comment._id }).update(update);
    }

    if (bulk.length) await bulk.execute();
  });


  // Save old version in history
  //
  N.wire.after(apiPath, function save_history(env) {
    return N.models.blogs.BlogCommentHistory.add(
      env.data.changes,
      {
        user: env.user_info.user_id,
        role: N.models.blogs.BlogEntryHistory.roles[env.params.as_moderator ? 'MODERATOR' : 'USER'],
        ip:   env.req.ip
      }
    );
  });


  // Remove votes
  //
  N.wire.after(apiPath, async function remove_votes(env) {
    await N.models.users.Vote.updateMany(
      { for: { $in: env.data.changes.map(({ old_comment }) => old_comment._id) } },
      // Just move vote `value` field to `backup` field
      { $rename: { value: 'backup' } }
    );
  });


  // Update comment counters
  //
  N.wire.after(apiPath, function update_counters(env) {
    return N.models.blogs.BlogEntry.updateCache(env.data.entry._id);
  });


  // Update user counters
  //
  N.wire.after(apiPath, async function update_user(env) {
    let users = env.data.changes.map(({ old_comment }) => old_comment.user);

    await N.models.blogs.UserBlogCommentCount.recount([ ...new Set(users.map(String)) ]);
  });


  // Schedule search index update
  //
  N.wire.after(apiPath, async function add_search_index(env) {
    await N.queue.blog_entries_search_update_by_ids([ env.data.entry._id ]).postpone();
    await N.queue.blog_comments_search_update_by_ids(
      env.data.changes.map(({ old_comment }) => old_comment._id)
    ).postpone();
  });


  // Send removed comment ids to client
  //
  N.wire.after(apiPath, function fill_removed_ids(env) {
    env.res.removed_comment_ids = env.data.changes.map(({ old_comment }) => old_comment._id);
  });
};
