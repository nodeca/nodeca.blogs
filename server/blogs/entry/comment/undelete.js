// Restore removed blog comment by id
//

'use strict';

const _ = require('lodash');


module.exports = function (N, apiPath) {

  N.validate(apiPath, {
    comment_id: { format: 'mongo', required: true }
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
    let statuses = N.models.blogs.BlogComment.statuses;

    if (env.data.comment.st === statuses.DELETED &&
        await env.extras.settings.fetch('blogs_mod_can_delete')) {
      return;
    }

    if (env.data.comment.st === statuses.DELETED_HARD &&
        await env.extras.settings.fetch('blogs_mod_can_see_hard_deleted')) {
      return;
    }

    // We shouldn't show that comment exists if no permissions
    throw N.io.NOT_FOUND;
  });


  // Prevent restoring a comment with removed parent
  //
  N.wire.before(apiPath, async function check_parent(env) {
    if (!env.data.comment.path.length) return;

    let parent_id = env.data.comment.path[env.data.comment.path.length - 1];
    let parent = await N.models.blogs.BlogComment.findById(parent_id)
                           .lean(true);

    let statuses = N.models.blogs.BlogComment.statuses;

    if (!parent || parent.st === statuses.DELETED || parent.st === statuses.DELETED_HARD) {
      throw { code: N.io.CLIENT_ERROR, message: env.t('err_parent_deleted') };
    }
  });


  // Restore comment
  //
  N.wire.on(apiPath, function restore_comment(env) {
    let update = {
      $unset: { del_reason: 1, prev_st: 1, del_by: 1 }
    };

    _.assign(update, env.data.comment.prev_st);

    return N.models.blogs.BlogComment.update({ _id: env.data.comment._id }, update);
  });


  // Restore votes
  //
  N.wire.after(apiPath, async function restore_votes(env) {
    await N.models.users.Vote.collection.update(
      { 'for': env.data.comment._id },
      // Just move vote `backup` field back to `value` field
      { $rename: { backup: 'value' } },
      { multi: true }
    );
  });


  // Update comment counters
  //
  N.wire.after(apiPath, function update_counters(env) {
    return N.models.blogs.BlogEntry.updateCounters(env.data.entry._id);
  });

  // TODO: schedule search index update

  // TODO: log moderator actions
};
