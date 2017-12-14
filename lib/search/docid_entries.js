// Generate sphinx docid for blog entries
//

'use strict';


module.exports = function search_docid_blog_entry(N, entry_hid) {
  return N.shared.content_type.BLOG_ENTRY * Math.pow(2, 47) + // 5 bit
         entry_hid; // 47 bit
};
