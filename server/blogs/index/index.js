// Main blog page (list of blog entries)
//

'use strict';

const _ = require('lodash');


module.exports = function (N, apiPath) {

  N.validate(apiPath, {});


  N.wire.on(apiPath, async function blog_index(env) {
    env.res.head.title = env.t('title');
    env.res.head.canonical = N.router.linkTo('blogs.index', env.params);

    let entries = await N.models.blogs.BlogEntry.find()
                            .where('st').equals(N.models.blogs.BlogEntry.statuses.VISIBLE)
                            .sort('-_id')
                            .limit(20)
                            .lean(true);

    env.data.users = (env.data.users || [])
                       .concat(_.map(entries, 'user'));

    // TODO: move it to separate sanitizer, check hellbanned for votes_hb
    env.res.entries = entries.map(entry => _.pick(entry, [ '_id', 'hid', 'title', 'html', 'comments', 'user', 'ts' ]));
  });


  // Fill breadcrumbs
  //
  N.wire.after(apiPath, function fill_breadcrumbs(env) {
    env.data.breadcrumbs = [];

    env.data.breadcrumbs.push({
      text: env.t('@common.menus.navbar.blogs'),
      route: 'blogs.index'
    });

    env.data.breadcrumbs.push({
      text: env.t('title')
    });

    env.res.breadcrumbs = env.data.breadcrumbs;
  });
};
