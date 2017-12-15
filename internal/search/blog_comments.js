// Execute search in blog comments
//
// In:
//
// - params.query
// - params.user_hid
// - params.entry_hid
// - params.sort
// - params.period
// - params.skip
// - params.limit
// - params.user_info
//
// Out:
//
// - count
// - results
// - users
//

'use strict';


const _                = require('lodash');
const sanitize_entry   = require('nodeca.blogs/lib/sanitizers/blog_entry');
const sanitize_comment = require('nodeca.blogs/lib/sanitizers/blog_comment');
const docid_entries    = require('nodeca.blogs/lib/search/docid_entries');
const docid_sole       = require('nodeca.blogs/lib/search/docid_sole');
const sphinx_escape    = require('nodeca.search').escape;


module.exports = function (N, apiPath) {

  // Send sql query to sphinx, get a response
  //
  N.wire.on(apiPath, async function execute_search(locals) {
    locals.sandbox = locals.sandbox || {};

    let query  = 'SELECT object_id FROM blog_comments WHERE MATCH(?) AND public=1';
    let params = [ sphinx_escape(locals.params.query) ];

    if (locals.params.user_hid) {
      query += ' AND user_uid=?';
      params.push(docid_sole(N, locals.params.user_hid));
    }

    if (locals.params.entry_hid) {
      query += ' AND entry_uid=?';
      params.push(docid_entries(N, locals.params.user_hid));
    }

    if (locals.params.period > 0) {
      query += ' AND ts > ?';
      // round timestamp to the lowest whole day
      params.push(Math.floor(Date.now() / (24 * 60 * 60 * 1000) - locals.params.period) * 24 * 60 * 60);
    }

    // sort is either `date` or `rel`, sphinx searches by relevance by default
    if (locals.params.sort === 'date') {
      query += ' ORDER BY ts DESC';
    }

    query += ' LIMIT ?,?';
    params.push(locals.params.skip);

    // increase limit by 1 to detect last chunk (only if limit != 0)
    params.push(locals.params.limit ? (locals.params.limit + 1) : 0);

    let reached_end = false;

    let [ results, count ] = await N.search.execute([
      [ query, params ],
      "SHOW META LIKE 'total_found'"
    ]);

    if (locals.params.limit !== 0) {
      if (results.length > locals.params.limit) {
        results.pop();
      } else {
        reached_end = true;
      }

      let comments = _.keyBy(
        await N.models.blogs.BlogComment.find()
                  .where('_id').in(_.map(results, 'object_id'))
                  .lean(true),
        '_id'
      );

      // copy posts preserving order
      locals.sandbox.comments = results.map(result => comments[result.object_id]).filter(Boolean);

      locals.sandbox.entries = await N.models.blogs.BlogEntry.find()
                                         .where('_id')
                                         .in(_.uniq(locals.sandbox.comments.map(c => String(c.entry))))
                                         .lean(true);
    } else {
      locals.sandbox.comments = [];
      locals.sandbox.entries  = [];
    }

    locals.count = Number(count[0].Value);
    locals.reached_end = reached_end;
  });


  // Check permissions for each comment
  //
  N.wire.on(apiPath, async function check_permissions(locals) {
    if (!locals.sandbox.comments.length) return;

    let entries_by_id = _.keyBy(locals.sandbox.entries, '_id');

    let entries_used = {};

    let access_env = { params: {
      comments: locals.sandbox.comments,
      user_info: locals.params.user_info,
      preload: locals.sandbox.entries
    } };

    await N.wire.emit('internal:blogs.access.comment', access_env);

    locals.sandbox.comments = locals.sandbox.comments.filter((comment, idx) => {
      let entry = entries_by_id[comment.entry];
      if (!entry) return;

      if (access_env.data.access_read[idx]) {
        entries_used[entry._id] = entry;
        return true;
      }

      return false;
    });

    locals.sandbox.entries = _.values(entries_used);
  });


  // Sanitize results
  //
  N.wire.on(apiPath, async function sanitize(locals) {
    if (!locals.sandbox.entries.length) return;

    locals.sandbox.comments = await sanitize_comment(N, locals.sandbox.comments, locals.params.user_info);
    locals.sandbox.entries  = await sanitize_entry(N, locals.sandbox.entries, locals.params.user_info);

    // avoid sending large attributes to the client that won't be used
    locals.sandbox.entries = locals.sandbox.entries.map(e =>
      _.omit(e, [ 'html', 'tail' ])
    );
  });


  // Fill results
  //
  N.wire.on(apiPath, function fill_results(locals) {
    locals.results = [];

    let entries_by_id = _.keyBy(locals.sandbox.entries, '_id');

    locals.sandbox.comments.forEach(comment => {
      let entry = entries_by_id[comment.entry];
      if (!entry) return;

      locals.results.push({ comment, entry });
    });
  });


  // Fill users
  //
  N.wire.on(apiPath, function fill_users(locals) {
    let users = {};

    locals.results.forEach(result => {
      let { entry, comment } = result;

      if (entry.user) users[entry.user] = true;
      if (entry.del_by) users[entry.del_by] = true;
      if (comment.user) users[comment.user] = true;
      if (comment.del_by) users[comment.del_by] = true;
      if (comment.import_users) comment.import_users.forEach(id => { users[id] = true; });
    });

    locals.users = Object.keys(users);
  });


  // Generate snippets for each post
  //
  N.wire.on(apiPath, async function generate_snippets(locals) {
    if (!locals.results.length) return;

    let htmls = locals.results.map(result => result.comment.html);

    let query = `
      CALL SNIPPETS(
        (?${',?'.repeat(htmls.length - 1)}),
        'blog_comments',
        ?,
        '<span class="search-highlight">' AS before_match,
        '</span>' AS after_match,
        'retain' AS html_strip_mode,
        1 AS query_mode,
        0 AS limit
      )`.replace(/\n\s+/mg, '');

    let args = htmls.concat([ sphinx_escape(locals.params.query) ]);

    let snippets = await N.search.execute(query, args);

    locals.results.forEach((result, i) => {
      result.comment.html = snippets[i].snippet;
    });
  });
};
