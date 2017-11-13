// Get a comment by its id; used to partially refresh page
// after undeletion, voting, etc.
//

'use strict';

const _                = require('lodash');
const sanitize_entry   = require('nodeca.blogs/lib/sanitizers/blog_entry');
const sanitize_comment = require('nodeca.blogs/lib/sanitizers/blog_comment');


module.exports = function (N, apiPath) {

  N.validate(apiPath, {
    entry_hid:   { type: 'integer', required: true },
    comment_ids: { type: 'array', required: true, uniqueItems: true, items: { format: 'mongo' } }
  });


  // Fetch entry
  //
  N.wire.before(apiPath, async function fetch_blog_entry(env) {
    env.data.entry = await N.models.blogs.BlogEntry.findOne()
                               .where('hid').equals(env.params.entry_hid)
                               .lean(true);

    if (!env.data.entry) throw N.io.NOT_FOUND;

    let access_env = { params: {
      entries: env.data.entry,
      user_info: env.user_info
    } };

    await N.wire.emit('internal:blogs.access.entry', access_env);

    if (!access_env.data.access_read) throw N.io.NOT_FOUND;

    let can_see_deleted_users = await env.extras.settings.fetch('can_see_deleted_users');

    let query = N.models.users.User.findById(env.data.entry.user).lean(true);

    // Check 'can_see_deleted_users' permission
    if (!can_see_deleted_users) {
      query.where({ exists: true });
    }

    env.data.user = await query.exec();

    if (!env.data.user) throw N.io.NOT_FOUND;
  });


  // Fetch comments
  //
  N.wire.before(apiPath, async function fetch_comments(env) {
    let statuses = N.models.blogs.BlogComment.statuses;

    let setting_names = [
      'can_see_hellbanned',
      'blogs_mod_can_delete',
      'blogs_mod_can_see_hard_deleted'
    ];

    let settings = await env.extras.settings.fetch(setting_names);

    let visibleSt = [ statuses.VISIBLE ];

    if (env.user_info.hb || settings.can_see_hellbanned) {
      visibleSt.push(statuses.HB);
    }

    if (settings.blogs_mod_can_delete) {
      visibleSt.push(statuses.DELETED);
    }

    if (settings.blogs_mod_can_see_hard_deleted) {
      visibleSt.push(statuses.DELETED_HARD);
    }

    let comments = await N.models.blogs.BlogComment.find()
                             .where('_id').in(env.params.comment_ids)
                             .where('entry').equals(env.data.entry._id)
                             .where('st').in(visibleSt)
                             .lean(true);

    let comment_paths = {};

    comments.forEach(comment => {
      comment_paths[comment._id] = comment.path.concat(comment._id).map(String).join(',');
    });

    env.data.comments = _.sortBy(comments, comment => comment_paths[comment._id]);
  });


  N.wire.on(apiPath, async function blog_comment(env) {
    env.data.users = env.data.users || [];

    env.data.comments.forEach(comment => {
      if (comment.user)   env.data.users.push(comment.user);
      if (comment.del_by) env.data.users.push(comment.del_by);

      if (comment.import_users) {
        env.data.users = env.data.users.concat(comment.import_users);
      }
    });

    env.res.entry    = await sanitize_entry(N, env.data.entry, env.user_info);
    env.res.comments = await sanitize_comment(N, env.data.comments, env.user_info);
  });


  // Fetch and fill bookmarks
  //
  N.wire.after(apiPath, async function fetch_and_fill_bookmarks(env) {
    let comment_bookmarks = await N.models.blogs.BlogCommentBookmark.find()
                                      .where('user').equals(env.user_info.user_id)
                                      .where('comment').in(_.map(env.data.comments, '_id'))
                                      .lean(true);

    if (!comment_bookmarks.length) return;

    env.res.own_bookmarks = _.map(comment_bookmarks, 'comment');
  });


  // Fetch and fill own votes
  //
  N.wire.after(apiPath, async function fetch_votes(env) {
    let votes = await N.models.users.Vote.find()
                          .where('from').equals(env.user_info.user_id)
                          .where('for').in(_.map(env.data.comments, '_id'))
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
                                .where('src').in(_.map(env.data.comments, '_id'))
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
