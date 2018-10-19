// History of the edits made for comments
//

'use strict';


const Mongoose       = require('mongoose');
const AttachmentInfo = require('./_AttachmentInfo');
const Schema         = Mongoose.Schema;


module.exports = function (N, collectionName) {

  let BlogCommentHistory = new Schema({
    // post id
    comment:    Schema.ObjectId,

    // user that changed post (may be post author or moderator)
    user:       Schema.ObjectId,

    // markdown source before changes
    md:         String,

    // tail before changes, schema is the same as in BlogComment
    tail:       [ AttachmentInfo ],

    // parser options before changes (not currently used anywhere;
    // could be useful for tracking turning smilies/media on/off)
    params_ref: Schema.ObjectId,

    // topic title before changes (only for 1st post in a given topic)
    //title:      String,

    // change time
    ts:         { type: Date, 'default': Date.now },

    // ip where this change was made from
    ip:         String
  }, {
    versionKey: false
  });


  // Indexes
  //////////////////////////////////////////////////////////////////////////////

  // find history for a particular post
  BlogCommentHistory.index({ comment: 1, _id: 1 });


  N.wire.on('init:models', function emit_init_BlogCommentHistory() {
    return N.wire.emit('init:models.' + collectionName, BlogCommentHistory);
  });


  N.wire.on('init:models.' + collectionName, function init_model_BlogCommentHistory(schema) {
    N.models[collectionName] = Mongoose.model(collectionName, schema);
  });
};
