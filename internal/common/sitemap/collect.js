// Collect urls to include in sitemap
//

'use strict';

const stream   = require('stream');
const multi    = require('multistream');


module.exports = function (N, apiPath) {

  N.wire.on(apiPath, async function get_blogs_sitemap(data) {
    let buffer = [];

    buffer.push({
      loc: N.router.linkTo('blogs.index', {}),
      lastmod: new Date()
    });

    let user_ids = await N.models.blogs.BlogEntry.distinct('user');

    let users = await N.models.users.User.find()
                          .where('_id').in(user_ids)
                          .select('hid')
                          .sort('hid')
                          .lean(true);

    for (let user of users) {
      buffer.push({ loc: N.router.linkTo('blogs.sole', { user_hid: user.hid }) });
    }

    let user_id_to_hid = users.reduce((acc, user) => {
      acc[user._id] = user.hid;
      return acc;
    }, {});

    users = null;

    let blog_stream = stream.Readable.from(buffer);

    let entry_stream = new stream.Transform({
      objectMode: true,
      transform(entry, encoding, callback) {
        let hid = user_id_to_hid[entry.user];

        if (hid) {
          this.push({
            loc: N.router.linkTo('blogs.entry', {
              user_hid: hid,
              entry_hid: entry.hid
            })
          });
        }

        callback();
      }
    });

    stream.pipeline(
      N.models.blogs.BlogEntry.find()
          .where('st').equals(N.models.blogs.BlogEntry.statuses.VISIBLE)
          .select('hid user')
          .sort('hid')
          .lean(true)
          .stream(),

      entry_stream,
      () => {}
    );

    data.streams.push({
      name: 'blogs',
      stream: multi.obj([ blog_stream, entry_stream ])
    });
  });
};
