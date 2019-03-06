// History of the edits made for blog entries
//

'use strict';


const _              = require('lodash');
const Mongoose       = require('mongoose');
const Schema         = Mongoose.Schema;

// If same user edits the same post within 5 minutes, all changes
// made within that period will be squashed into one diff.
const HISTORY_GRACE_PERIOD = 5 * 60 * 1000;


let roles = {
  USER:      1,
  MODERATOR: 2,
  TASK:      3
};


module.exports = function (N, collectionName) {

  // list of properties we want to track
  let entrySchema = {
    title:      String,
    md:         String,
    st:         Number,
    ste:        Number,
    tags:       [ String ],
    del_reason: String,
    del_by:     Schema.ObjectId,
    prev_st: {
      st:  Number,
      ste: Number
    },
    params_ref: Schema.ObjectId
  };


  let BlogEntryHistory = new Schema({
    // entry id
    entry: Schema.ObjectId,

    // metadata
    user: Schema.ObjectId,
    ts:   { type: Date, 'default': Date.now },
    ip:   String,
    role: Number,

    // old information before changes were made
    entry_data: entrySchema
  }, {
    versionKey: false
  });


  // Indexes
  //////////////////////////////////////////////////////////////////////////////

  // find history for a particular post
  BlogEntryHistory.index({ entry: 1, _id: 1 });


  // Export roles
  //
  BlogEntryHistory.statics.roles = roles;


  // Helper used to pick data from arbitrary object in accordance with provided schema
  //
  function getDataBySchema(data, schema) {
    // convert mongoose object to plain js object
    if (typeof data.toJSON === 'function') data = data.toJSON();

    // get all listed properties
    return _.pick(data, Object.keys(schema));
  }


  /*
   * Add a new history entry
   *
   * Params:
   *
   * - changes (Array)    - each item is an object describing changes to a single post
   *   - old_entry (Object) - entry version before updates
   *   - new_entry (Object) - entry version after updates
   * - meta (Object)      - metadata for this change
   *   - user (ObjectId)    - who made those changes
   *   - role (Number)      - under what permission set this change was made
   *   - ip   (String)      - ip address (optional, default: 127.0.0.1)
   *   - ts   (Date)        - time of change (optional, default: now)
   *
   * This function collapses changes if they are made:
   *  - by the same user
   *  - with the same role
   *  - within short period of time (grace period)
   *
   * In order to do this, it fetches previous version recorded in history
   * and compares all three:
   *  - "new" (latest revision) - from params, post after changes are made
   *  - "old" (2nd latest)      - from params, post before changes are made
   *  - "prev" (3rd latest)     - from latest found history entry
   *
   * There are four possible outcomes for each change:
   *
   * 1. It can be added as a new history entry
   *    - if "new-old" and "old-prev" changes aren't collapsible
   * 2. It can update previous history entry
   *    - if "new-old" and "old-prev" are collapsible, and "new"!="prev"
   * 3. It can remove previous history entry
   *    - if "new-old" and "old-prev" are collapsible, and "new"="prev"
   * 4. Nothing is added, nothing is removed
   *    - if "new-old" has no changes (submitted posts are identical)
   */
  BlogEntryHistory.statics.add = async function addHistory(changes, meta) {
    if (!Array.isArray(changes)) changes = [ changes ];

    meta = Object.assign({}, meta);
    if (!meta.ts) meta.ts = new Date();
    if (!meta.ip) meta.ip = '127.0.0.1'; // for TASK

    //
    // Select all history ids first, used for:
    //  - selecting last history entry
    //  - counting number of changes later
    //
    // (this fetches large numbers of smaller documents, index only)
    //
    let history_ids = await N.models.blogs.BlogEntryHistory.find()
                                .where('entry').in(_.map(changes, 'new_entry._id'))
                                .select('entry _id')
                                .sort('_id')
                                .lean(true);

    //
    // Find number of history entries per post, and last change id for each post
    //
    let history = {};

    for (let { new_entry } of changes) {
      history[new_entry._id] = { count: 0, last: null };
    }

    for (let { entry, _id } of history_ids) {
      history[entry].count++;
      history[entry].last = _id;
    }

    //
    // Fetch last history record for each post
    //
    // (this fetches small numbers of large documents, entire history entries)
    //
    let last_history_entry = _.keyBy(
      await N.models.blogs.BlogEntryHistory.find()
                .where('_id').in(_.map(Object.values(history), 'last').filter(Boolean))
                .lean(true),
      'entry'
    );

    let bulk_history = N.models.blogs.BlogEntryHistory.collection.initializeUnorderedBulkOp();

    for (let { old_entry, new_entry } of changes) {
      let prev = last_history_entry[new_entry._id];
      let old_data = getDataBySchema(old_entry, entrySchema);
      let old_data_str = JSON.stringify(old_data);
      let new_data = getDataBySchema(new_entry, entrySchema);
      let new_data_str = JSON.stringify(new_data);

      // stop if no changes were made (shouldn't normally happen)
      if (old_data_str === new_data_str) continue;

      //
      // Merge changes if the same user edits the same post within grace period,
      // so the conditions are:
      //
      //  - previous history entry exists
      //  - user is the same
      //  - role is the same
      //  - ts is within last 5 minutes
      //
      if (prev &&
          String(prev.user) === String(meta.user) &&
          prev.role === meta.role &&
          prev.ts > meta.ts - HISTORY_GRACE_PERIOD && prev.ts <= meta.ts) {

        let prev_data = getDataBySchema(prev.entry_data, entrySchema); // sort keys
        let prev_data_str = JSON.stringify(prev_data);

        if (prev_data_str === new_data_str) {
          //
          // Remove last history entry when user reverts changes
          //
          history[new_entry._id].count--;
          bulk_history.find({ _id: prev._id }).remove();
          continue;
        }

        //
        // Merge changes into existing history entry
        //
        // we do not need to do anything here:
        //  - meta (ip, ts) is kept from older entry
        //  - data (previous state before changes) is kept from older entry
        //
        continue;
      }

      //
      // Do not record a change made within grace period of post creation,
      // so the conditions are:
      //
      //  - previous history doesn't exist
      //  - user is the same as post author
      //  - role is USER (assume all new posts are created as user)
      //  - post creation time is within last 5 minutes
      //
      if (!prev &&
          String(new_entry.user) === String(meta.user) &&
          meta.role === N.models.blogs.BlogEntryHistory.roles.USER &&
          new_entry.ts > meta.ts - HISTORY_GRACE_PERIOD && new_entry.ts <= meta.ts) {
        continue;
      }

      //
      // Add new history entry
      //
      history[new_entry._id].count++;

      bulk_history.insert({
        entry:      new_entry._id,
        user:       meta.user,
        ts:         meta.ts,
        ip:         meta.ip,
        role:       meta.role,
        entry_data: old_data
      });
    }

    if (bulk_history.length > 0) await bulk_history.execute();

    let bulk = N.models.blogs.BlogEntry.collection.initializeUnorderedBulkOp();

    for (let { new_entry } of changes) {
      bulk.find({ _id: new_entry._id }).update({
        $set: {
          last_edit_ts: meta.ts,
          edit_count: history[new_entry._id].count
        }
      });
    }

    if (bulk.length > 0) await bulk.execute();
  };


  N.wire.on('init:models', function emit_init_BlogEntryHistory() {
    return N.wire.emit('init:models.' + collectionName, BlogEntryHistory);
  });


  N.wire.on('init:models.' + collectionName, function init_model_BlogEntryHistory(schema) {
    N.models[collectionName] = Mongoose.model(collectionName, schema);
  });
};
