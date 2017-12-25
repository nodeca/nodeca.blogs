// Collect urls to include in sitemap
//

'use strict';

const from2    = require('from2');
const multi    = require('multistream');
const pumpify  = require('pumpify');
const through2 = require('through2');


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

    let tag_stream = pumpify.obj(
      N.models.blogs.BlogTag.find()
          .where('is_category').equals(true)
          .select('hid user')
          .sort('hid')
          .lean(true)
          .cursor(),

      through2.obj(function (tag, encoding, callback) {
        let hid = user_id_to_hid[tag.user];

        if (hid) {
          this.push({
            loc: N.router.linkTo('blogs.sole', {
              user_hid: hid,
              $query: { tag: tag.hid }
            })
          });
        }

        callback();
      })
    );

    let entry_stream = pumpify.obj(
      N.models.blogs.BlogEntry.find()
          .where('st').equals(N.models.blogs.BlogEntry.statuses.VISIBLE)
          .select('hid user')
          .sort('hid')
          .lean(true)
          .cursor(),

      through2.obj(function (entry, encoding, callback) {
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
      })
    );

    data.streams.push({
      name: 'blogs',
      stream: multi.obj([ from2.obj(buffer), tag_stream, entry_stream ])
    });
  });
};
