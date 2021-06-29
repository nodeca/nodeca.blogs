'use strict';


const _              = require('lodash');
const Mongoose       = require('mongoose');
const Schema         = Mongoose.Schema;


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
    VISIBLE:      1,
    HB:           2,
    DELETED:      3,
    DELETED_HARD: 4
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

    // Flag set if entry state isn't deleted or hard deleted;
    // used in counting user's activity to quickly determine if comment
    // should be counted (i.e. in a visible entry) or not
    entry_exists: { type: Boolean, default: true },

    ip:           String,
    ts:           { type: Date, default: Date.now },

    votes:        { type: Number, default: 0 },
    votes_hb:     { type: Number, default: 0 },
    bookmarks:    { type: Number, default: 0 },
    del_reason:   String,
    del_by:       Schema.ObjectId,
    prev_st:      { st: Number, ste: Number },
    edit_count:   Number,
    last_edit_ts: Date,

    params_ref:   Schema.ObjectId,
    imports:      [ String ],
    import_users: [ Schema.ObjectId ]
  }, {
    versionKey : false
  });

  // Indexes
  /////////////////////////////////////////////////////////////////////////////

  // get all comments for a blog entry,
  // get last comment in a blog entry (rebuild entry cache)
  BlogComment.index({ entry: 1, st: 1, hid: 1 });

  // count all comments from a user
  BlogComment.index({
    user: 1,
    st: 1,
    entry_exists: 1
  });

  // Export statuses
  //
  BlogComment.statics.statuses = statuses;


  // Remove empty "imports" and "import_users" fields
  //
  BlogComment.pre('save', function () {
    if (this.imports?.length === 0) {
      /*eslint-disable no-undefined*/
      this.imports = undefined;
    }

    if (this.import_users?.length === 0) {
      /*eslint-disable no-undefined*/
      this.import_users = undefined;
    }
  });


  // Store parser options separately and save reference to them
  //
  BlogComment.pre('save', async function () {
    if (!this.params) return;

    let id = await N.models.core.MessageParams.setParams(this.params);

    /*eslint-disable no-undefined*/
    this.params = undefined;
    this.params_ref = id;
  });


  // Set 'hid' for the new comment.
  // This hook should always be the last one to avoid counter increment on error
  BlogComment.pre('save', async function () {
    if (!this.isNew) return;

    let entry = await N.models.blogs.BlogEntry.findByIdAndUpdate(
      this.entry,
      { $inc: { last_comment_counter: 1 } },
      { new: true }
    );

    this.hid = entry.last_comment_counter;
  });


  N.wire.on('init:models', function emit_init_BlogComment() {
    return N.wire.emit('init:models.' + collectionName, BlogComment);
  });

  N.wire.on('init:models.' + collectionName, function init_model_BlogComment(schema) {
    N.models[collectionName] = Mongoose.model(collectionName, schema);
  });
};
