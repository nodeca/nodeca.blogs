// Extend `internal:common.abuse_report` to send abuse report for type `BLOG_COMMENT`
//
// In:
//
// - report - N.models.core.AbuseReport
//
// Out:
//
// - recipients - { user_id: user_info }
// - locals - rendering data
// - email_templates - { body, subject }
// - log_templates - { body, subject }
//
//
'use strict';


const _        = require('lodash');
const userInfo = require('nodeca.users/lib/user_info');


module.exports = function (N, apiPath) {

  // Subcall `internal:common.abuse_report` for `BLOG_COMMENT` content type
  //
  N.wire.on('internal:common.abuse_report', async function blog_comment_abuse_report_subcall(params) {
    if (params.report.type === N.shared.content_type.BLOG_COMMENT) {
      params.data = params.data || {};
      await N.wire.emit('internal:common.abuse_report.blog_comment', params);
    }
  });


  // Fetch entry, comment and user (blog owner)
  //
  N.wire.before(apiPath, async function fetch_entry_comment(params) {
    params.data.comment = await N.models.blogs.BlogComment.findById(params.report.src).lean(true);

    if (!params.data.comment) throw N.io.NOT_FOUND;

    params.data.entry = await N.models.blogs.BlogEntry.findById(params.data.comment.entry).lean(true);

    if (!params.data.entry) throw N.io.NOT_FOUND;

    params.data.user = await N.models.users.User.findById(params.data.entry.user).lean(true);

    if (!params.data.user) throw N.io.NOT_FOUND;
  });


  // Fetch recipients
  //
  N.wire.before(apiPath, async function fetch_recipients(params) {
    // send message to all administrators
    let admin_group_id = await N.models.users.UserGroup.findIdByName('administrators');

    let recipients = await N.models.users.User.find()
                               .where('usergroups').equals(admin_group_id)
                               .select('_id')
                               .lean(true);

    let recipients_ids = _.map(recipients, '_id');

    params.recipients = await userInfo(N, recipients_ids);
  });


  // Prepare locals
  //
  N.wire.on(apiPath, async function prepare_locals(params) {
    let locals = params.locals || {};
    let author = params.report.from ? await userInfo(N, params.report.from) : null;

    params.log_templates = {
      body: 'common.abuse_report.blog_comment.log_templates.body',
      subject: 'common.abuse_report.blog_comment.log_templates.subject'
    };

    params.email_templates = {
      body: 'common.abuse_report.blog_comment.email_templates.body',
      subject: 'common.abuse_report.blog_comment.email_templates.subject'
    };

    locals.project_name = await N.settings.get('general_project_name');
    locals.report_text = params.report.text;
    locals.src_url = N.router.linkTo('blogs.entry', {
      user_hid:  params.data.user.hid,
      entry_hid: params.data.entry.hid,
      $anchor:   'comment' + params.data.comment.hid
    });
    locals.src_text = params.data.entry.md;
    locals.src_html = params.data.entry.html;
    locals.recipients = _.values(params.recipients);

    if (author) locals.author = author;

    params.locals = locals;
  });
};
