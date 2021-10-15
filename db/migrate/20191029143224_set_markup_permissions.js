'use strict';


module.exports.up = async function (N) {
  let global_store = N.settings.getStore('global');

  if (!global_store) throw 'Settings store `global` is not registered.';

  // disable attachments in comments (enabled by default)
  await global_store.set({ blog_comments_markup_attachment: { value: false } });

  // enable cut and heading in blog entries (disabled by default)
  await global_store.set({ blog_entries_markup_cut: { value: true } });
  await global_store.set({ blog_entries_markup_heading: { value: true } });
};
