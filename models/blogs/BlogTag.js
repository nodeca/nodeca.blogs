'use strict';


const Mongoose = require('mongoose');
const Schema   = Mongoose.Schema;


module.exports = function (N, collectionName) {

  let BlogTag = new Schema({
    hid:         Number,
    name_lc:     String,
    user:        Schema.ObjectId,
    is_category: Boolean
  }, {
    versionKey : false
  });

  // Indexes
  /////////////////////////////////////////////////////////////////////////////

  // get tag by hid
  BlogTag.index({ hid: 1 });

  // - select categories for a user
  // - find category by name
  BlogTag.index({ user: 1, name_lc: 1 });


  // Set 'hid' for the new tag.
  // This hook should always be the last one to avoid counter increment on error
  BlogTag.pre('save', async function () {
    if (!this.isNew) return;

    // hid is already defined when this topic was created, used in vbconvert;
    // it's caller responsibility to increase Increment accordingly
    if (this.hid) return;

    this.hid = await N.models.core.Increment.next('blog_tag');
  });


  BlogTag.statics.normalize = function (name) {
    return name.replace(/\s+/g, ' ').trim().toLowerCase();
  };


  N.wire.on('init:models', function emit_init_BlogTag() {
    return N.wire.emit('init:models.' + collectionName, BlogTag);
  });

  N.wire.on('init:models.' + collectionName, function init_model_BlogTag(schema) {
    N.models[collectionName] = Mongoose.model(collectionName, schema);
  });
};
