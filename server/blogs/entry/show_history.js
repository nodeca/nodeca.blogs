// Show entry edit history
//

'use strict';


module.exports = function (N, apiPath) {

  N.validate(apiPath, {
    entry_id: { format: 'mongo', required: true }
  });


  // Check permissions
  //
  N.wire.before(apiPath, async function check_permissions(env) {
    let can_see_history = await env.extras.settings.fetch('can_see_history');

    if (!can_see_history) throw N.io.FORBIDDEN;
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


  // Fetch and return entry edit history
  //
  N.wire.on(apiPath, async function get_entry_history(env) {
    let history = await N.models.blogs.BlogEntryHistory.find()
                            .where('entry').equals(env.data.entry._id)
                            .sort('_id')
                            .lean(true);

    env.res.history = [];

    let previous_user = env.data.entry.user;
    let previous_ts   = env.data.entry.ts;

    env.data.users = env.data.users || [];
    env.data.users.push(env.data.entry.user);

    // unfold history, so each item would have user corresponding to its text
    for (let item of history) {
      env.res.history.push({
        md:    item.md,
        tags:  item.tags,
        tail:  item.tail,
        title: item.title,
        ts:    previous_ts,
        user:  previous_user
      });

      previous_user = item.user;
      previous_ts   = item.ts;

      env.data.users.push(item.user);
    }

    // last item will have current entry text and last editor
    /* eslint-disable no-undefined */
    env.res.history.push({
      md:    env.data.entry.md,
      tags:  env.data.entry.tags,
      tail:  env.data.entry.tail,
      title: env.data.entry.title,
      ts:    previous_ts,
      user:  previous_user
    });
  });
};
