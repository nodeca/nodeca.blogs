'use strict';


const Mongoose = require('mongoose');
const Schema   = Mongoose.Schema;

module.exports = function (N, collectionName) {

  let BlogEntryBookmark = new Schema({
    user:  Schema.ObjectId,
    entry: Schema.ObjectId
  }, {
    versionKey : false
  });

  /////////////////////////////////////////////////////////////////////////////
  // Indexes

  // Used in entry list. Get bookmarks for user.
  BlogEntryBookmark.index({ user: 1, entry: 1 });


  N.wire.on('init:models', function emit_init_BlogEntryBookmark() {
    return N.wire.emit('init:models.' + collectionName, BlogEntryBookmark);
  });

  N.wire.on('init:models.' + collectionName, function init_model_BlogEntryBookmark(schema) {
    N.models[collectionName] = Mongoose.model(collectionName, schema);
  });
};
