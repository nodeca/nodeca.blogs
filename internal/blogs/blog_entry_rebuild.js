// Get a blog entry from the database, rebuild it and write it back
//
'use strict';


const _              = require('lodash');
const create_preview = require('nodeca.blogs/lib/create_preview');


module.exports = function (N, apiPath) {

  N.wire.on(apiPath, async function rebuild_blog_entry(ids) {
    if (!Array.isArray(ids)) ids = [ ids ];

    let posts = await N.models.blogs.BlogEntry.find()
                          .where('_id').in(ids)
                          .lean(true);

    let bulk = N.models.blogs.BlogEntry.collection.initializeUnorderedBulkOp();

    await Promise.all(posts.map(async post => {
      let params = await N.models.core.MessageParams.getParams(post.params_ref);
      let result = await N.parser.md2html({
        text:         post.md,
        options:      params,
        imports:      post.imports,
        import_users: post.import_users
      });

      let preview = create_preview(result.html);

      let updateData = {
        $set: {
          html: preview
        }
      };

      let needsUpdate = !_.isEqual(preview, post.html);

      for (let field of [ 'imports', 'import_users' ]) {
        if (!_.isEmpty(result[field])) {
          updateData.$set[field] = result[field];
          needsUpdate = needsUpdate || !_.isEqual(result[field].map(String), (post[field] || []).map(String));
        } else {
          updateData.$unset = updateData.$unset || {};
          updateData.$unset[field] = true;
          needsUpdate = needsUpdate || typeof post[field] !== 'undefined';
        }
      }

      if (needsUpdate) {
        bulk.find({ _id: post._id }).update(updateData);
      }
    }));

    if (bulk.length > 0) await bulk.execute();
  });
};
