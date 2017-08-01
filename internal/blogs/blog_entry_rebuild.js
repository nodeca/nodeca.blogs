// Get a blog entry from the database, rebuild it and write it back
//
'use strict';


const _ = require('lodash');


module.exports = function (N, apiPath) {

  N.wire.on(apiPath, async function rebuild_blog_entry(id) {
    let post = await N.models.blogs.BlogEntry.findById(id).lean(true);

    if (!post) return;

    let params = await N.models.core.MessageParams.getParams(post.params_ref);
    let result = await N.parser.md2html({
      text:         post.md,
      attachments:  post.attach,
      options:      params,
      imports:      post.imports
    });

    let updateData = {
      tail: result.tail,
      html: result.html
    };

    [ 'imports', 'import_users' ].forEach(field => {
      if (!_.isEmpty(result[field])) {
        updateData[field] = result[field];
      } else {
        updateData.$unset = updateData.$unset || {};
        updateData.$unset[field] = true;
      }
    });

    await N.models.blogs.BlogEntry.update({ _id: post._id }, updateData);
  });
};
