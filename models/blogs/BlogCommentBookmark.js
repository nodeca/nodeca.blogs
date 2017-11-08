'use strict';


const Mongoose = require('mongoose');
const Schema   = Mongoose.Schema;

module.exports = function (N, collectionName) {

  let BlogCommentBookmark = new Schema({
    user:    Schema.ObjectId,
    comment: Schema.ObjectId
  }, {
    versionKey : false
  });

  /////////////////////////////////////////////////////////////////////////////
  // Indexes

  // Used in comments. Get bookmarks for user.
  BlogCommentBookmark.index({ user: 1, comment: 1 });


  N.wire.on('init:models', function emit_init_BlogCommentBookmark() {
    return N.wire.emit('init:models.' + collectionName, BlogCommentBookmark);
  });

  N.wire.on('init:models.' + collectionName, function init_model_BlogCommentBookmark(schema) {
    N.models[collectionName] = Mongoose.model(collectionName, schema);
  });
};
