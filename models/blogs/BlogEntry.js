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

  set_content_type('BLOG_SOLE', 4);
  set_content_type('BLOG_ENTRY', 5);

  let statuses = {
    VISIBLE:      1,
    HB:           2,
    DELETED:      3,
    DELETED_HARD: 4
  };

  let cache = {
    comment_count:    { type: Number, default: 0 },

    // used to display last comment author in tracker
    last_comment:     Schema.ObjectId,
    last_comment_hid: Number,
    last_user:        Schema.ObjectId,
    last_ts:          Date
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
    ts:           { type: Date, default: Date.now },

    views:        { type: Number, default: 0 },
    votes:        { type: Number, default: 0 },
    votes_hb:     { type: Number, default: 0 },
    bookmarks:    { type: Number, default: 0 },
    del_reason:   String,
    del_by:       Schema.ObjectId,
    prev_st:      { st: Number, ste: Number },
    edit_count:   Number,
    last_edit_ts: Date,

    // Last assigned hid to the comments to this entry,
    // used to determine hid of a new comment
    last_comment_counter: { type: Number, default: 0 },

    params_ref:   Schema.ObjectId,
    imports:      [ String ],
    import_users: [ Schema.ObjectId ],

    // Cache
    cache,
    cache_hb: cache
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

  // get entries changed in last month (for Marker.gc),
  // sparse to avoid indexing blog entries with no comments
  BlogEntry.index({ user: 1, 'cache.last_comment': -1 }, { sparse: true });
  BlogEntry.index({ user: 1, 'cache_hb.last_comment': -1 }, { sparse: true });

  // Export statuses
  //
  BlogEntry.statics.statuses = statuses;


  // Remove empty "imports" and "import_users" fields
  //
  BlogEntry.pre('save', function () {
    if (this.imports && this.imports.length === 0) {
      /*eslint-disable no-undefined*/
      this.imports = undefined;
    }

    if (this.import_users && this.import_users.length === 0) {
      /*eslint-disable no-undefined*/
      this.import_users = undefined;
    }
  });


  // Store parser options separately and save reference to them
  //
  BlogEntry.pre('save', async function () {
    if (!this.params) return;

    let id = await N.models.core.MessageParams.setParams(this.params);

    /*eslint-disable no-undefined*/
    this.params = undefined;
    this.params_ref = id;
  });


  // Set 'hid' for the new blog entry.
  // This hook should always be the last one to avoid counter increment on error
  BlogEntry.pre('save', async function () {
    if (!this.isNew) return;

    // hid is already defined when this topic was created, used in vbconvert;
    // it's caller responsibility to increase Increment accordingly
    if (this.hid) return;

    this.hid = await N.models.core.Increment.next('blog_entry');
  });


  // Update cache
  //
  BlogEntry.statics.updateCache = async function (entry_id) {
    let statuses = N.models.blogs.BlogEntry.statuses;
    let updateData = { $set: {} };

    // Find last comment
    let comment = await N.models.blogs.BlogComment.findOne()
                            .where('entry').equals(entry_id)
                            .or([ { st: statuses.VISIBLE }, { st: statuses.HB } ])
                            .sort('-hid')
                            .lean(true);

    if (!comment) comment = {};

    updateData.$set['cache_hb.last_comment']     = comment._id;
    updateData.$set['cache_hb.last_comment_hid'] = comment.hid;
    updateData.$set['cache_hb.last_user']        = comment.user;
    updateData.$set['cache_hb.last_ts']          = comment.ts;

    updateData.$set['cache.last_comment']     = comment._id;
    updateData.$set['cache.last_comment_hid'] = comment.hid;
    updateData.$set['cache.last_user']        = comment.user;
    updateData.$set['cache.last_ts']          = comment.ts;

    // If last comment hellbanned - find visible one
    if (comment.st === statuses.HB) {
      // Find last visible comment
      let comment_visible = await N.models.blogs.BlogComment.findOne()
                                  .where('entry').equals(entry_id)
                                  .where('st').equals(statuses.VISIBLE)
                                  .sort('-hid')
                                  .lean(true);

      if (!comment_visible) comment_visible = {};

      updateData.$set['cache.last_comment']     = comment_visible._id;
      updateData.$set['cache.last_comment_hid'] = comment_visible.hid;
      updateData.$set['cache.last_user']        = comment_visible.user;
      updateData.$set['cache.last_ts']          = comment_visible.ts;
    }

    let count = await Promise.all(
                        [ statuses.VISIBLE, statuses.HB ].map(st =>
                          N.models.blogs.BlogComment
                              .where('entry').equals(entry_id)
                              .where('st').equals(st)
                              .countDocuments()
                        )
                      );

    // Visible comment count
    updateData.$set['cache.comment_count'] = count[0];

    // Hellbanned comment count
    updateData.$set['cache_hb.comment_count'] = count[0] + count[1];

    // { updateData.$set[x]: undefined } => { updateData.$unset[x]: true }
    for (let key of Object.keys(updateData.$set)) {
      if (typeof updateData.$set[key] === 'undefined') {
        delete updateData.$set[key];

        updateData.$unset = updateData.$unset || {};
        updateData.$unset[key] = true;
      }
    }

    await N.models.blogs.BlogEntry.updateOne({ _id: entry_id }, updateData);
  };


  N.wire.on('init:models', function emit_init_BlogEntry() {
    return N.wire.emit('init:models.' + collectionName, BlogEntry);
  });

  N.wire.on('init:models.' + collectionName, function init_model_BlogEntry(schema) {
    N.models[collectionName] = Mongoose.model(collectionName, schema);
  });
};
