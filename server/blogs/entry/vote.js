// Vote for a blog entry
//

'use strict';


module.exports = function (N, apiPath) {

  N.validate(apiPath, {
    entry_id: { format: 'mongo', required: true },
    value:    { type: 'integer', required: true }
  });


  // Check auth
  //
  N.wire.before(apiPath, function check_auth(env) {
    if (!env.user_info.is_member) throw N.io.FORBIDDEN;
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


  // Check voting permissions
  //
  N.wire.before(apiPath, async function check_vote_permissions(env) {
    let can_vote = await env.extras.settings.fetch('can_vote');

    if (!can_vote) throw N.io.FORBIDDEN;
  });


  // Check permissions to vote on this entry
  //
  N.wire.before(apiPath, async function check_entry_vote_permissions(env) {
    let entry = env.data.entry;
    let votes_add_max_time = await env.extras.settings.fetch('votes_add_max_time');

    // Check if it is our own post
    if (String(entry.user) === String(env.user_info.user_id)) {
      // Hardcode msg, this should never happen because of client-side restrictions
      throw {
        code: N.io.CLIENT_ERROR,
        message: "Can't vote on your own post"
      };
    }

    if (votes_add_max_time !== 0 && entry.ts < Date.now() - votes_add_max_time * 60 * 60 * 1000) {
      throw {
        code: N.io.CLIENT_ERROR,
        message: env.t('err_perm_expired')
      };
    }
  });


  // Remove previous vote if exists
  //
  N.wire.before(apiPath, function remove_votes(env) {
    return N.models.users.Vote.remove(
      { 'for': env.params.entry_id, from: env.user_info.user_id }
    );
  });


  // Add vote
  //
  N.wire.on(apiPath, function add_vote(env) {
    if (env.params.value === 0) return;

    return N.models.users.Vote.update(
      { 'for': env.params.entry_id, from: env.user_info.user_id },
      {
        to: env.data.entry.user,
        type: N.shared.content_type.BLOG_ENTRY,
        value: env.params.value === 1 ? 1 : -1,
        hb: env.user_info.hb
      },
      { upsert: true }
    );
  });


  // Update blog entry
  //
  N.wire.after(apiPath, async function update_entry(env) {
    let result = await N.models.users.Vote.aggregate([
      { $match: { 'for': env.data.entry._id } },
      {
        $group: {
          _id: null,
          votes: { $sum: { $cond: { 'if': '$hb', then: 0, 'else': '$value' } } },
          votes_hb: { $sum: '$value' }
        }
      },
      { $project: { _id: false, votes: true, votes_hb: true } }
    ]).exec();

    await N.models.blogs.BlogEntry.update(
      { _id: env.data.entry._id },
      result[0] || { votes: 0, votes_hb: 0 }
    );
  });


  // Mark user as active
  //
  N.wire.after(apiPath, async function set_active_flag(env) {
    return N.wire.emit('internal:users.mark_user_active', env);
  });
};
