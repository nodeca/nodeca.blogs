// Execute search in blog entries
//
// In:
//
// - params.query
// - params.user_hid
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


const _              = require('lodash');
const sanitize_entry = require('nodeca.blogs/lib/sanitizers/blog_entry');
const docid_sole     = require('nodeca.blogs/lib/search/docid_sole');
const sphinx_escape  = require('nodeca.search').escape;


module.exports = function (N, apiPath) {

  // Send sql query to sphinx, get a response
  //
  N.wire.on(apiPath, async function execute_search(locals) {
    locals.sandbox = locals.sandbox || {};

    let query  = 'SELECT object_id FROM blog_entries WHERE MATCH(?) AND public=1';
    let params = [ sphinx_escape(locals.params.query) ];

    if (locals.params.user_hid) {
      query += ' AND user_uid=?';
      params.push(docid_sole(N, locals.params.user_hid));
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

      let entries = _.keyBy(
        await N.models.blogs.BlogEntry.find()
                  .where('_id').in(_.map(results, 'object_id'))
                  .lean(true),
        '_id'
      );

      // copy posts preserving order
      locals.sandbox.entries = results.map(result => entries[result.object_id]).filter(Boolean);
    } else {
      locals.sandbox.entries = [];
    }

    locals.count = Number(count[0].Value);
    locals.reached_end = reached_end;
  });


  // Check permissions for each entry
  //
  N.wire.on(apiPath, async function check_permissions(locals) {
    if (!locals.sandbox.entries.length) return;

    let access_env = { params: {
      entries: locals.sandbox.entries,
      user_info: locals.params.user_info
    } };

    await N.wire.emit('internal:blogs.access.entry', access_env);

    locals.sandbox.entries = locals.sandbox.entries.filter((entry, idx) => {
      return access_env.data.access_read[idx];
    });
  });


  // Sanitize results
  //
  N.wire.on(apiPath, async function sanitize(locals) {
    if (!locals.sandbox.entries.length) return;

    locals.sandbox.entries = await sanitize_entry(N, locals.sandbox.entries, locals.params.user_info);
  });


  // Fill results
  //
  N.wire.on(apiPath, function fill_results(locals) {
    locals.results = [];

    locals.sandbox.entries.forEach(entry => {
      locals.results.push({ entry });
    });
  });


  // Fill users
  //
  N.wire.on(apiPath, function fill_users(locals) {
    let users = {};

    locals.results.forEach(result => {
      let entry = result.entry;

      if (entry.user) users[entry.user] = true;
      if (entry.del_by) users[entry.del_by] = true;
      if (entry.import_users) entry.import_users.forEach(id => { users[id] = true; });
    });

    locals.users = Object.keys(users);
  });


  // Generate snippets for each post
  //
  N.wire.on(apiPath, async function generate_snippets(locals) {
    if (!locals.results.length) return;

    let htmls = [];

    locals.results.forEach(result => {
      htmls.push(_.escape(result.entry.title));
      htmls.push(result.entry.html);
    });

    let query = `
      CALL SNIPPETS(
        (?${',?'.repeat(htmls.length - 1)}),
        'blog_entries',
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
      result.entry.title_html = snippets[2 * i].snippet;
      result.entry.html       = snippets[2 * i + 1].snippet;
    });
  });
};
