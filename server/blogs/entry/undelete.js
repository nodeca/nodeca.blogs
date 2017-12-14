// Restore removed blog entry by id
//

'use strict';

const _ = require('lodash');


module.exports = function (N, apiPath) {

  N.validate(apiPath, {
    entry_id: { format: 'mongo', required: true }
  });


  // Fetch entry
  //
  N.wire.before(apiPath, async function fetch_entry(env) {
    env.data.entry = await N.models.blogs.BlogEntry
                               .findById(env.params.entry_id)
                               .lean(true);

    if (!env.data.entry) throw N.io.NOT_FOUND;
  });


  // Check if user can see this entry
  //
  N.wire.before(apiPath, async function check_access(env) {
    let access_env = { params: {
      entries: env.data.entry,
      user_info: env.user_info
    } };

    await N.wire.emit('internal:blogs.access.entry', access_env);

    if (!access_env.data.access_read) throw N.io.NOT_FOUND;
  });


  // Check permissions
  //
  N.wire.before(apiPath, async function check_permissions(env) {
    let statuses = N.models.blogs.BlogEntry.statuses;

    if (env.data.entry.st === statuses.DELETED &&
        await env.extras.settings.fetch('blogs_mod_can_delete')) {
      return;
    }

    if (env.data.entry.st === statuses.DELETED_HARD &&
        await env.extras.settings.fetch('blogs_mod_can_see_hard_deleted')) {
      return;
    }

    // We shouldn't show that entry exists if no permissions
    throw N.io.NOT_FOUND;
  });


  // Restore entry
  //
  N.wire.on(apiPath, function restore_entry(env) {
    let update = {
      $unset: { del_reason: 1, prev_st: 1, del_by: 1 }
    };

    _.assign(update, env.data.entry.prev_st);

    return N.models.blogs.BlogEntry.update({ _id: env.data.entry._id }, update);
  });


  // Restore votes
  //
  N.wire.after(apiPath, async function restore_votes(env) {
    await N.models.users.Vote.collection.update(
      { 'for': env.data.entry._id },
      // Just move vote `backup` field back to `value` field
      { $rename: { backup: 'value' } },
      { multi: true }
    );

    let st = N.models.blogs.BlogComment.statuses;

    let comments = await N.models.blogs.BlogComment.find()
                             .where('entry').equals(env.data.entry._id)
                             .where('st').in([ st.VISIBLE, st.HB ])
                             .select('_id')
                             .lean(true);

    await N.models.users.Vote.collection.update(
      { 'for': { $in: _.map(comments, '_id') } },
      // Just move vote `backup` field back to `value` field
      { $rename: { backup: 'value' } },
      { multi: true }
    );
  });


  // Schedule search index update
  //
  N.wire.after(apiPath, async function add_search_index(env) {
    await N.queue.blog_entries_search_update_with_comments([ env.data.entry._id ]).postpone();
  });

  // TODO: log moderator actions
};
