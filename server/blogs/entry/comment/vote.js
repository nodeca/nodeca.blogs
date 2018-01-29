// Vote for a blog comment
//

'use strict';


module.exports = function (N, apiPath) {

  N.validate(apiPath, {
    comment_id: { format: 'mongo', required: true },
    value:      { type: 'integer', required: true }
  });


  // Check auth
  //
  N.wire.before(apiPath, function check_auth(env) {
    if (!env.user_info.is_member) throw N.io.FORBIDDEN;
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


  // Check voting permissions
  //
  N.wire.before(apiPath, async function check_vote_permissions(env) {
    let can_vote = await env.extras.settings.fetch('can_vote');

    if (!can_vote) throw N.io.FORBIDDEN;
  });


  // Check permissions to vote on this entry
  //
  N.wire.before(apiPath, async function check_comment_vote_permissions(env) {
    let comment = env.data.comment;
    let votes_add_max_time = await env.extras.settings.fetch('votes_add_max_time');

    // Check if it is our own post
    if (String(comment.user) === String(env.user_info.user_id)) {
      // Hardcode msg, this should never happen because of client-side restrictions
      throw {
        code: N.io.CLIENT_ERROR,
        message: "Can't vote on your own post"
      };
    }

    if (votes_add_max_time !== 0 && comment.ts < Date.now() - votes_add_max_time * 60 * 60 * 1000) {
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
      { 'for': env.params.comment_id, from: env.user_info.user_id }
    );
  });


  // Add vote
  //
  N.wire.on(apiPath, function add_vote(env) {
    if (env.params.value === 0) return;

    return N.models.users.Vote.update(
      { 'for': env.params.comment_id, from: env.user_info.user_id },
      {
        to: env.data.entry.user,
        type: N.shared.content_type.BLOG_COMMENT,
        value: env.params.value === 1 ? 1 : -1,
        hb: env.user_info.hb
      },
      { upsert: true }
    );
  });


  // Update blog comment
  //
  N.wire.after(apiPath, async function update_comment(env) {
    let result = await N.models.users.Vote.aggregate([
      { $match: { 'for': env.data.comment._id } },
      {
        $group: {
          _id: null,
          votes: { $sum: { $cond: { 'if': '$hb', then: 0, 'else': '$value' } } },
          votes_hb: { $sum: '$value' }
        }
      },
      { $project: { _id: false, votes: true, votes_hb: true } }
    ]).exec();

    await N.models.blogs.BlogComment.update(
      { _id: env.data.comment._id },
      result[0] || { votes: 0, votes_hb: 0 }
    );
  });


  // Create auto report after too many downvotes
  //
  N.wire.after(apiPath, async function auto_report(env) {
    // only run this code when user downvotes
    if (env.params.value >= 0) return;

    let votes_auto_report = await env.extras.settings.fetch('votes_auto_report');

    if (votes_auto_report <= 0) return;

    let downvote_count = await N.models.users.Vote
                                   .where('for').equals(env.data.comment._id)
                                   .where('value').lt(0)
                                   .where('hb').ne(true)
                                   .count();

    if (downvote_count < votes_auto_report) return;

    // check if report already exists
    let exists = await N.models.core.AbuseReport.findOne()
                           .where('src').equals(env.data.comment._id)
                           .where('type').equals(N.shared.content_type.BLOG_COMMENT)
                           .where('auto_reported').equals(true)
                           .select('_id')
                           .lean(true);

    if (exists) return;

    let bot = await N.models.users.User.findOne()
                        .where('hid').equals(N.config.bots.default_bot_hid)
                        .select('_id')
                        .lean(true);

    let params = await N.models.core.MessageParams.getParams(env.data.comment.params_ref);

    // enable markup used in templates (even if it's disabled in forum)
    params.link  = true;
    params.quote = true;

    let report = new N.models.core.AbuseReport({
      src: env.data.comment._id,
      type: N.shared.content_type.BLOG_COMMENT,
      text: env.t('auto_abuse_report_text'),
      from: bot._id,
      auto_reported: true,
      params_ref: await N.models.core.MessageParams.setParams(params)
    });

    await N.wire.emit('internal:common.abuse_report', { report });
  });


  // Mark user as active
  //
  N.wire.after(apiPath, async function set_active_flag(env) {
    return N.wire.emit('internal:users.mark_user_active', env);
  });
};
