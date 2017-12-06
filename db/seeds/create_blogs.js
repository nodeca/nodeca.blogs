// Create demo blog entries and comments
//
'use strict';


const _         = require('lodash');
const charlatan = require('charlatan');
const ObjectId  = require('mongoose').Types.ObjectId;


const USER_COUNT        = 10;
const ENTRY_COUNT       = 100;
const MAX_TAG_COUNT     = 20;
const MAX_COMMENT_COUNT = 20;
const MAX_VOTES         = 10;


let models;
let settings;
let parser;
let shared;


let users        = [];
let tags_by_user = {};
let postDay      = 0;


async function createDemoUsers() {
  for (let i = 0; i < USER_COUNT; i++) {
    let user = await new models.users.User({
      first_name: charlatan.Name.firstName(),
      last_name:  charlatan.Name.lastName(),
      nick:       charlatan.Internet.userName(),
      email:      charlatan.Internet.email(),
      joined_ts:  new Date()
    }).save();

    // add user to store
    users.push(user);
  }
}


async function createTags() {
  let store = settings.getStore('user');

  for (let user of users) {
    tags_by_user[user._id] = [];

    let tag_names = [];

    for (let i = charlatan.Helpers.rand(MAX_TAG_COUNT); i > 0; i--) {
      tag_names.push(charlatan.Lorem.word());
    }

    let categories = [];

    for (let tag_name of _.uniq(tag_names)) {
      let tag = await models.blogs.BlogTag.create({
        name:        tag_name,
        user:        user._id,
        is_category: !charlatan.Helpers.rand(3) // 1/3 of tags are categories
      });

      tags_by_user[user._id].push(tag);

      if (tag.is_category) {
        categories.push(tag.name);
      }
    }

    await store.set({
      blogs_categories: { value: charlatan.Helpers.shuffle(categories).join(',') }
    }, { user_id: user._id });
  }
}


async function addVotes(post, content_type) {
  let count = 0;

  let votes = charlatan.Helpers.shuffle(users)
                  .slice(0, charlatan.Helpers.rand(MAX_VOTES))
                  .map(user => ({ user, value: Math.random() > 0.5 ? 1 : -1 }));

  for (let { user, value } of votes) {
    let vote = new models.users.Vote({
      to:     post.user,
      from:   user._id,
      'for':  post._id,
      type:   content_type,
      value
    });

    count += value;

    await vote.save();
  }

  post.votes = post.votes_hb = count;
}


async function createComments(entry) {
  let previous_comments = [];

  for (let hid = 1; hid <= entry.last_comment_counter; hid++) {
    let date = new Date(2010, 0, postDay++);
    let md = charlatan.Lorem.paragraphs(charlatan.Helpers.rand(3, 1)).join('\n\n');
    let user = users[charlatan.Helpers.rand(USER_COUNT)];

    let options = await settings.getByCategory(
      'blog_comments_markup',
      { usergroup_ids: user.usergroups },
      { alias: true }
    );

    let result = await parser.md2html({
      text: md,
      attachments: [],
      options
    });

    let reply_to;

    if (previous_comments.length && charlatan.Helpers.rand(2)) {
      reply_to = charlatan.Helpers.sample(previous_comments);
    }

    let comment = new models.blogs.BlogComment({
      _id:     new ObjectId(Math.round(date / 1000)),
      entry:   entry._id,
      hid,
      user,
      st:      models.blogs.BlogComment.statuses.VISIBLE,
      ts:      date,
      md,
      html:    result.html,
      /*eslint-disable new-cap*/
      ip:      charlatan.Internet.IPv4(),
      path:    reply_to ? reply_to.path.concat(reply_to._id) : []
    });

    // set parser params (`params` is not included in the model,
    // so we need to assign it separately)
    entry.params = options;

    await addVotes(comment, shared.content_type.BLOG_COMMENT);

    previous_comments.push(await comment.save());
  }
}


async function createEntries() {
  for (let i = 0; i < ENTRY_COUNT; i++) {
    let date = new Date(2010, 0, postDay++);
    let md = charlatan.Lorem.paragraphs(charlatan.Helpers.rand(7, 3)).join('\n\n');
    let user = users[charlatan.Helpers.rand(USER_COUNT)];

    let options = await settings.getByCategory(
      'blog_entries_markup',
      { usergroup_ids: user.usergroups },
      { alias: true }
    );

    let result = await parser.md2html({
      text: md,
      attachments: [],
      options
    });

    let comment_count = charlatan.Helpers.rand(MAX_COMMENT_COUNT);

    // up to 10 random tags in random order
    let tags = charlatan.Helpers.shuffle(tags_by_user[user._id]).slice(0, charlatan.Helpers.rand(10));

    let entry = new models.blogs.BlogEntry({
      _id:         new ObjectId(Math.round(date / 1000)),
      title:       charlatan.Lorem.sentence().slice(0, -1),
      user,
      st:          models.blogs.BlogEntry.statuses.VISIBLE,
      ts:          date,
      views:       charlatan.Helpers.rand(1000),
      md,
      html:        result.html,
      /*eslint-disable new-cap*/
      ip:          charlatan.Internet.IPv4(),
      comments:    comment_count,
      comments_hb: comment_count,
      tag_hids:    tags.map(tag => tag.hid),
      tag_source:  tags.map(tag => tag.name).join(', '),
      last_comment_counter: comment_count
    });

    // set parser params (`params` is not included in the model,
    // so we need to assign it separately)
    entry.params = options;

    await addVotes(entry, shared.content_type.BLOG_ENTRY);

    await createComments(await entry.save());
  }
}


module.exports = async function (N) {
  models   = N.models;
  settings = N.settings;
  parser   = N.parser;
  shared   = N.shared;

  await createDemoUsers();
  await createTags();
  await createEntries();
};
