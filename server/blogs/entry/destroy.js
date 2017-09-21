// Remove blog entry by id
//

'use strict';

const _ = require('lodash');


module.exports = function (N, apiPath) {

  N.validate(apiPath, {
    entry_id:     { format: 'mongo', required: true },
    reason:       { type: 'string' },
    method:       { type: 'string', 'enum': [ 'hard', 'soft' ], required: true },
    as_moderator: { type: 'boolean', required: true }
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
    let entry = env.data.entry;

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

    // Check blog entry owner
    if (env.user_info.user_id !== String(entry.user)) {
      throw N.io.FORBIDDEN;
    }
  });


  // Remove entry
  //
  N.wire.on(apiPath, function delete_entry(env) {
    let statuses = N.models.blogs.BlogEntry.statuses;
    let update = {
      st: env.params.method === 'hard' ? statuses.DELETED_HARD : statuses.DELETED,
      $unset: { ste: 1 },
      prev_st: _.pick(env.data.entry, [ 'st', 'ste' ]),
      del_by: env.user_info.user_id
    };

    if (env.params.reason) {
      update.del_reason = env.params.reason;
    }

    return N.models.blogs.BlogEntry.update({ _id: env.data.entry._id }, update);
  });


  // Remove votes
  //
  N.wire.after(apiPath, async function remove_votes(env) {
    await N.models.users.Vote.collection.update(
      { 'for': env.data.entry._id },
      // Just move vote `value` field to `backup` field
      { $rename: { value: 'backup' } },
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
      // Just move vote `value` field to `backup` field
      { $rename: { value: 'backup' } },
      { multi: true }
    );
  });

  // TODO: schedule search index update

  // TODO: log moderator actions
};
