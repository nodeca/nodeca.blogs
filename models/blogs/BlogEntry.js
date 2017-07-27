'use strict';


const Mongoose = require('mongoose');
const Schema   = Mongoose.Schema;


module.exports = function (N, collectionName) {

  let statuses = {
    VISIBLE:  1,
    HB:       2,
    DELETED:  3
  };

  let BlogEntry = new Schema({
    hid:          Number,
    title:        String,
    user:         Schema.ObjectId,
    md:           String,
    html:         String,
    st:           Number,
    ste:          Number, // real state if user is hellbanned
    ip:           String,
    tag_hids:     [ Number ],
    tag_source:   String,
    ts:           { type: Date, 'default': Date.now },
    comments:     { type: Number, 'default': 0 },

    views:        { type: Number, 'default': 0 },
    votes:        { type: Number, 'default': 0 },
    votes_hb:     { type: Number, 'default': 0 },
    bookmarks:    { type: Number, 'default': 0 },
    del_reason:   String,
    del_by:       Schema.ObjectId,
    prev_st:      { st: Number, ste: Number },

    // Last assigned hid to the comments to this entry,
    // used to determine hid of a new comment
    last_comment_counter: { type: Number, 'default': 0 },

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

  // lookup _id by hid (for routing)
  BlogEntry.index({ hid: 1 });

  // get a list of last blog entries for main page
  BlogEntry.index({ _id: -1, st: 1 });

  // get a list of blog entries for a user
  BlogEntry.index({ user: 1, _id: -1, st: 1 });

  // get a list of blog entries by tag
  BlogEntry.index({ tag_hids: 1, _id: -1, st: 1 });

  // Export statuses
  //
  BlogEntry.statics.statuses = statuses;


  // Set 'hid' for the new blog entry.
  // This hook should always be the last one to avoid counter increment on error
  BlogEntry.pre('save', function (callback) {
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

    N.models.core.Increment.next('blog_entry', (err, value) => {
      if (err) {
        callback(err);
        return;
      }

      this.hid = value;
      callback();
    });
  });


  N.wire.on('init:models', function emit_init_BlogEntry() {
    return N.wire.emit('init:models.' + collectionName, BlogEntry);
  });

  N.wire.on('init:models.' + collectionName, function init_model_BlogEntry(schema) {
    N.models[collectionName] = Mongoose.model(collectionName, schema);
  });
};
