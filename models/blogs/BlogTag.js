'use strict';


const Mongoose = require('mongoose');
const Schema   = Mongoose.Schema;


module.exports = function (N, collectionName) {

  let BlogTag = new Schema({
    hid:         Number,
    name:        String,
    user:        Schema.ObjectId,
    is_category: Boolean
  }, {
    versionKey : false
  });

  // Indexes
  /////////////////////////////////////////////////////////////////////////////

  // get tag by hid
  BlogTag.index({ hid: 1 });

  // select categories for a user
  BlogTag.index({ user: 1, is_category: 1 });


  // Set 'hid' for the new tag.
  // This hook should always be the last one to avoid counter increment on error
  BlogTag.pre('save', function (callback) {
    if (!this.isNew) {
      callback();
      return;
    }

    if (this.hid) {
      // hid is already defined when this topic was created, used in vbconvert;
      // it's caller responsibility to increase Increment accordingly
      callback();
      return;
    }

    N.models.core.Increment.next('blog_tag', (err, value) => {
      if (err) {
        callback(err);
        return;
      }

      this.hid = value;
      callback();
    });
  });


  N.wire.on('init:models', function emit_init_BlogTag() {
    return N.wire.emit('init:models.' + collectionName, BlogTag);
  });

  N.wire.on('init:models.' + collectionName, function init_model_BlogTag(schema) {
    N.models[collectionName] = Mongoose.model(collectionName, schema);
  });
};
