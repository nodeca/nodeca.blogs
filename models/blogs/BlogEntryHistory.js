// History of the edits made for blog entries
//

'use strict';


const Mongoose       = require('mongoose');
const AttachmentInfo = require('./_AttachmentInfo');
const Schema         = Mongoose.Schema;


module.exports = function (N, collectionName) {

  let BlogEntryHistory = new Schema({
    // post id
    entry:      Schema.ObjectId,

    // user that changed post (may be post author or moderator)
    user:       Schema.ObjectId,

    // markdown source before changes
    md:         String,

    tags:       [ String ],

    // tail before changes, schema is the same as in BlogEntry
    tail:       [ AttachmentInfo ],

    // parser options before changes (not currently used anywhere;
    // could be useful for tracking turning smilies/media on/off)
    params_ref: Schema.ObjectId,

    // topic title before changes (only for 1st post in a given topic)
    title:      String,

    // change time
    ts:         { type: Date, 'default': Date.now }
  }, {
    versionKey: false
  });


  // Indexes
  //////////////////////////////////////////////////////////////////////////////

  // find history for a particular post
  BlogEntryHistory.index({ entry: 1, _id: 1 });


  N.wire.on('init:models', function emit_init_BlogEntryHistory() {
    return N.wire.emit('init:models.' + collectionName, BlogEntryHistory);
  });


  N.wire.on('init:models.' + collectionName, function init_model_BlogEntryHistory(schema) {
    N.models[collectionName] = Mongoose.model(collectionName, schema);
  });
};
