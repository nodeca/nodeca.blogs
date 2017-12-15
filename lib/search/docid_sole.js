// Generate sphinx docid for user's blog
//

'use strict';


module.exports = function search_docid_blog_sole(N, user_hid) {
  return N.shared.content_type.BLOG_SOLE * Math.pow(2, 47) + // 5 bit
         user_hid; // 47 bit
};
