// Show comment edit history
//

'use strict';


module.exports = function (N, apiPath) {

  N.validate(apiPath, {
    comment_id: { format: 'mongo', required: true }
  });


  // Check permissions
  //
  N.wire.before(apiPath, async function check_permissions(env) {
    let can_see_history = await env.extras.settings.fetch('can_see_history');

    if (!can_see_history) throw N.io.FORBIDDEN;
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


  // Fetch and return comment edit history
  //
  N.wire.on(apiPath, async function get_comment_history(env) {
    let history = await N.models.blogs.BlogCommentHistory.find()
                            .where('comment').equals(env.data.comment._id)
                            .sort('_id')
                            .lean(true);

    env.res.history = [];

    let previous_user = env.data.comment.user;
    let previous_ts   = env.data.comment.ts;

    env.data.users = env.data.users || [];
    env.data.users.push(env.data.comment.user);

    // unfold history, so each item would have user corresponding to its text
    for (let item of history) {
      env.res.history.push({
        md:    item.md,
        tail:  item.tail,
        //title: item.title,
        ts:    previous_ts,
        user:  previous_user
      });

      previous_user = item.user;
      previous_ts   = item.ts;

      env.data.users.push(item.user);
    }

    // last item will have current comment text and last editor
    /* eslint-disable no-undefined */
    env.res.history.push({
      md:    env.data.comment.md,
      tail:  env.data.comment.tail,
      //title: env.data.comment.title,
      ts:    previous_ts,
      user:  previous_user
    });
  });
};
