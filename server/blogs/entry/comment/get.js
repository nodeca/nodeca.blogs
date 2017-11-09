// Get a comment by its id; used to partially refresh page
// after undeletion, voting, etc.
//

'use strict';

const _                = require('lodash');
const sanitize_entry   = require('nodeca.blogs/lib/sanitizers/blog_entry');
const sanitize_comment = require('nodeca.blogs/lib/sanitizers/blog_comment');


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


  N.wire.on(apiPath, async function blog_comment(env) {
    env.data.users = env.data.users || [];

    if (env.data.comment.user)   env.data.users.push(env.data.comment.user);
    if (env.data.comment.del_by) env.data.users.push(env.data.comment.del_by);

    if (env.data.comment.import_users) {
      env.data.users = env.data.users.concat(env.data.comment.import_users);
    }

    env.res.entry    = await sanitize_entry(N, env.data.entry, env.user_info);
    env.res.comments = await sanitize_comment(N, [ env.data.comment ], env.user_info);
  });


  // Fetch and fill bookmarks
  //
  N.wire.after(apiPath, async function fetch_and_fill_bookmarks(env) {
    let comment_bookmarks = await N.models.blogs.BlogCommentBookmark.find()
                                      .where('user').equals(env.user_info.user_id)
                                      .where('comment').equals(env.data.comment._id)
                                      .lean(true);

    if (!comment_bookmarks.length) return;

    env.res.own_bookmarks = _.map(comment_bookmarks, 'comment');
  });


  // Fetch and fill own votes
  //
  N.wire.after(apiPath, async function fetch_votes(env) {
    let votes = await N.models.users.Vote.find()
                          .where('from').equals(env.user_info.user_id)
                          .where('for').equals(env.data.comment._id)
                          .where('value').in([ 1, -1 ])
                          .lean(true);

    env.data.own_votes = votes;

    if (!votes.length) return;

    // [ { _id: ..., for: '562f3569c5b8d831367b0585', value: -1 } ] -> { 562f3569c5b8d831367b0585: -1 }
    env.res.own_votes = votes.reduce((acc, vote) => {
      acc[vote.for] = vote.value;
      return acc;
    }, {});
  });


  // Fetch infractions
  //
  N.wire.after(apiPath, async function fetch_infractions(env) {
    let settings = await env.extras.settings.fetch([
      'blogs_mod_can_add_infractions',
      'can_see_infractions'
    ]);

    if (!settings.can_see_infractions && !settings.blogs_mod_can_add_infractions) return;

    let infractions = await N.models.users.Infraction.find()
                                .where('src').equals(env.data.comment._id)
                                .where('exists').equals(true)
                                .select('src points ts')
                                .lean(true);

    env.res.infractions = infractions.reduce((acc, infraction) => {
      acc[infraction.src] = infraction;
      return acc;
    }, {});
  });


  // Fetch settings needed on the client-side
  //
  N.wire.after(apiPath, async function fetch_settings(env) {
    env.res.settings = Object.assign({}, env.res.settings, await env.extras.settings.fetch([
      'blogs_can_create',
      'blogs_reply_old_comment_threshold',
      'blogs_mod_can_delete',
      'blogs_mod_can_hard_delete',
      'blogs_mod_can_add_infractions',
      'can_report_abuse',
      'can_vote',
      'can_see_ip',
      'votes_add_max_time',
      'blogs_edit_comments_max_time'
    ]));
  });
};
