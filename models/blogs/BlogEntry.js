'use strict';


const _              = require('lodash');
const Mongoose       = require('mongoose');
const AttachmentInfo = require('./_AttachmentInfo');
const Schema         = Mongoose.Schema;


module.exports = function (N, collectionName) {

  function set_content_type(name, value) {
    let duplicate = _.invert(_.get(N, 'shared.content_type', {}))[value];

    if (typeof duplicate !== 'undefined') {
      throw new Error(`Duplicate content type id=${value} for ${name} and ${duplicate}`);
    }

    _.set(N, 'shared.content_type.' + name, value);
  }

  set_content_type('BLOG_SOLE', 4);
  set_content_type('BLOG_ENTRY', 5);

  let statuses = {
    VISIBLE:      1,
    HB:           2,
    DELETED:      3,
    DELETED_HARD: 4
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
    tags:         [ String ],
    ts:           { type: Date, 'default': Date.now },
    comments:     { type: Number, 'default': 0 },
    comments_hb:  { type: Number, 'default': 0 },

    views:        { type: Number, 'default': 0 },
    votes:        { type: Number, 'default': 0 },
    votes_hb:     { type: Number, 'default': 0 },
    bookmarks:    { type: Number, 'default': 0 },
    del_reason:   String,
    del_by:       Schema.ObjectId,
    prev_st:      { st: Number, ste: Number },
    edit_count:   Number,
    last_edit_ts: Date,

    // Last assigned hid to the comments to this entry,
    // used to determine hid of a new comment
    last_comment_counter: { type: Number, 'default': 0 },

    attach:       [ Schema.Types.ObjectId ],
    params_ref:   Schema.ObjectId,
    imports:      [ String ],
    import_users: [ Schema.ObjectId ],
    tail:         [ AttachmentInfo ]
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


  // Remove empty "imports" and "import_users" fields
  //
  BlogEntry.pre('save', function (callback) {
    if (this.imports && this.imports.length === 0) {
      /*eslint-disable no-undefined*/
      this.imports = undefined;
    }

    if (this.import_users && this.import_users.length === 0) {
      /*eslint-disable no-undefined*/
      this.import_users = undefined;
    }

    callback();
  });


  // Store parser options separately and save reference to them
  //
  BlogEntry.pre('save', function (callback) {
    if (!this.params) {
      callback();
      return;
    }

    N.models.core.MessageParams.setParams(this.params)
      .then(id => {
        this.params = undefined;
        this.params_ref = id;
      })
      .asCallback(callback);
  });


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


  // Update comment counters
  //
  BlogEntry.statics.updateCounters = async function (entry_id) {
    let statuses = N.models.blogs.BlogEntry.statuses;
    let updateData = {};

    let count = await Promise.all(
                        [ statuses.VISIBLE, statuses.HB ].map(st =>
                          N.models.blogs.BlogComment
                              .where('entry').equals(entry_id)
                              .where('st').equals(st)
                              .count()
                        )
                      );

    // Visible comment count
    updateData.comments = count[0];

    // Hellbanned comment count
    updateData.comments_hb = count[0] + count[1];

    await N.models.blogs.BlogEntry.update({ _id: entry_id }, { $set: updateData });
  };


  N.wire.on('init:models', function emit_init_BlogEntry() {
    return N.wire.emit('init:models.' + collectionName, BlogEntry);
  });

  N.wire.on('init:models.' + collectionName, function init_model_BlogEntry(schema) {
    N.models[collectionName] = Mongoose.model(collectionName, schema);
  });
};
