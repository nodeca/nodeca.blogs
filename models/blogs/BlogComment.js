'use strict';


const _        = require('lodash');
const Mongoose = require('mongoose');
const Schema   = Mongoose.Schema;


module.exports = function (N, collectionName) {

  function set_content_type(name, value) {
    let duplicate = _.invert(_.get(N, 'shared.content_type', {}))[value];

    if (typeof duplicate !== 'undefined') {
      throw new Error(`Duplicate content type id=${value} for ${name} and ${duplicate}`);
    }

    _.set(N, 'shared.content_type.' + name, value);
  }

  set_content_type('BLOG_COMMENT', 6);

  let statuses = {
    VISIBLE:  1,
    HB:       2,
    DELETED:  3
  };

  let BlogComment = new Schema({
    hid:          Number,
    user:         Schema.ObjectId,
    entry:        Schema.ObjectId,
    path:         [ Schema.ObjectId ],
    md:           String,
    html:         String,
    st:           Number,
    ste:          Number, // real state if user is hellbanned
    ip:           String,
    ts:           { type: Date, 'default': Date.now },

    votes:        { type: Number, 'default': 0 },
    votes_hb:     { type: Number, 'default': 0 },
    bookmarks:    { type: Number, 'default': 0 },
    del_reason:   String,
    del_by:       Schema.ObjectId,
    prev_st:      { st: Number, ste: Number },

    attach:       [ Schema.Types.ObjectId ],
    params_ref:   Schema.ObjectId,
    imports:      [ String ],
    import_users: [ Schema.ObjectId ],
    tail:         [ new Schema({ // explicit definition to remove `_id` field
      media_id: Schema.ObjectId,
      file_name: String,
      type: { type: Number }
    }, { _id: false }) ]
  }, {
    versionKey : false
  });

  // Indexes
  /////////////////////////////////////////////////////////////////////////////

  // get all comments for a blog entry
  BlogComment.index({ entry: 1 });

  // Export statuses
  //
  BlogComment.statics.statuses = statuses;


  N.wire.on('init:models', function emit_init_BlogComment() {
    return N.wire.emit('init:models.' + collectionName, BlogComment);
  });

  N.wire.on('init:models.' + collectionName, function init_model_BlogComment(schema) {
    N.models[collectionName] = Mongoose.model(collectionName, schema);
  });
};
