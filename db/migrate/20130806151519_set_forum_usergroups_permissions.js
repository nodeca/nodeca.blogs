'use strict';


module.exports.up = async function (N) {
  let usergroupStore = N.settings.getStore('usergroup');

  // add usergroup settings for admin

  let adminGroupId = await N.models.users.UserGroup.findIdByName('administrators');

  await usergroupStore.set({
    blogs_can_create:               { value: true },
    blogs_show_ignored:             { value: true },
    blogs_mod_can_delete:           { value: true },
    blogs_mod_can_hard_delete:      { value: true },
    blogs_mod_can_see_hard_deleted: { value: true },
    blogs_mod_can_add_infractions:  { value: true }
  }, { usergroup_id: adminGroupId });

  // add usergroup settings for member

  let memberGroupId = await N.models.users.UserGroup.findIdByName('members');

  await usergroupStore.set({
    blogs_can_create: { value: true }
  }, { usergroup_id: memberGroupId });

  // add usergroup settings for violators
  //
  // note: it is a modifier group added to users in addition to their
  //       existing usergroups, thus we should turn "force" flag on

  let violatorsGroupId = await N.models.users.UserGroup.findIdByName('violators');

  await usergroupStore.set({
    blogs_can_create:             { value: false, force: true },
    blogs_edit_comments_max_time: { value: 0, force: true }
  }, { usergroup_id: violatorsGroupId });

  // add usergroup settings for banned

  let bannedGroupId = await N.models.users.UserGroup.findIdByName('banned');

  await usergroupStore.set({
    blogs_edit_comments_max_time: { value: 0 }
  }, { usergroup_id: bannedGroupId });
};
