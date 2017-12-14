// Generate sphinx docid for blog comments
//

'use strict';


module.exports = function search_docid_blog_comment(N, entry_hid, comment_hid) {
  return N.shared.content_type.BLOG_COMMENT * Math.pow(2, 47) + // 5 bit
         entry_hid * Math.pow(2, 20) + // 27 bit
         comment_hid; // 20 bit
};
