// Extend `internal:common.abuse_report` to send abuse report for type `BLOG_ENTRY`
//
// In:
//
// - report - N.models.core.AbuseReport
//
// Out:
//
// - recipients - { user_id: user_info }
// - locals - rendering data
// - subject_email
// - subject_log
// - template
//
'use strict';


const userInfo = require('nodeca.users/lib/user_info');


function escape_md(text) {
  return text.replace(/([!#$%&*+\-:<=>@[\\\]^_`{}~])/g, '\\$1'); //`
}


module.exports = function (N, apiPath) {

  // Subcall `internal:common.abuse_report` for `BLOG_ENTRY` content type
  //
  N.wire.on('internal:common.abuse_report', async function blog_entry_abuse_report_subcall(params) {
    if (params.report.type === N.shared.content_type.BLOG_ENTRY) {
      params.data = params.data || {};
      await N.wire.emit('internal:common.abuse_report.blog_entry', params);
    }
  });


  // Fetch entry and user (blog owner)
  //
  N.wire.before(apiPath, async function fetch_entry(params) {
    params.data.entry = await N.models.blogs.BlogEntry.findById(params.report.src).lean(true);

    if (!params.data.entry) throw N.io.NOT_FOUND;

    params.data.user = await N.models.users.User.findById(params.data.entry.user).lean(true);

    if (!params.data.user) throw N.io.NOT_FOUND;
  });


  // Fetch recipients
  //
  N.wire.before(apiPath, async function fetch_recipients(params) {
    // send message to all users with infraction permissions
    let groups = await N.models.users.UserGroup.find().select('_id');

    let allowed_groups = [];

    for (let usergroup of groups) {
      let params = {
        usergroup_ids: [ usergroup._id ]
      };

      let can_add_infractions = await N.settings.get('blogs_mod_can_add_infractions', params, {});

      if (can_add_infractions) allowed_groups.push(usergroup._id);
    }

    let recipients = await N.models.users.User.find()
                               .where('usergroups').in(allowed_groups)
                               .select('_id')
                               .lean(true);

    let user_infos = await userInfo(N, recipients.map(x => x._id));

    let allowed_userinfos = {};

    // double-check all permissions in case a user is disallowed from another
    // group with force=true
    for (let user_id of Object.keys(user_infos)) {
      let user_info = user_infos[user_id];

      let params = {
        user_id: user_info.user_id,
        usergroup_ids: user_info.usergroups
      };

      let can_add_infractions = await N.settings.get('blogs_mod_can_add_infractions', params, {});

      if (can_add_infractions) allowed_userinfos[user_id] = user_info;
    }

    params.recipients = allowed_userinfos;
  });


  // Prepare locals
  //
  N.wire.on(apiPath, async function prepare_locals(params) {
    let locals = params.locals || {};
    let author = params.report.from ? await userInfo(N, params.report.from) : null;

    const TEMPLATE_PATH = 'common.abuse_report.blog_entry';

    params.subject_log   = `${TEMPLATE_PATH}.subject_log`;
    params.subject_email = `${TEMPLATE_PATH}.subject_email`;
    params.template      = TEMPLATE_PATH;

    locals.project_name = await N.settings.get('general_project_name');
    locals.report_text = params.report.text;
    locals.src_url = N.router.linkTo('blogs.entry', {
      user_hid:  params.data.user.hid,
      entry_hid: params.data.entry.hid
    });
    locals.src_text = escape_md(params.data.entry.title) + '\n\n' + params.data.entry.md;
    locals.auto_reported = params.report.auto_reported;

    // calculate minimum backtick length for ````quote, so it would encapsulate
    // original content (longest backtick sequence plus 1, but at least 3)
    let backtick_seq_len = Math.max.apply(
      null,
      ('`` ' + locals.report_text + ' ' + locals.src_text)
        .match(/`+/g) //`
        .map(s => s.length)
      ) + 1;

    locals.backticks = '`'.repeat(backtick_seq_len);

    if (author) {
      locals.author = author;
      locals.author_link = N.router.linkTo('users.member', { user_hid: author.user_hid });
    }

    params.locals = locals;
  });
};
