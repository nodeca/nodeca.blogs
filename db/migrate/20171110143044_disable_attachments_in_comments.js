'use strict';


module.exports.up = async function (N) {
  let global_store = N.settings.getStore('global');

  if (!global_store) throw 'Settings store `global` is not registered.';

  await global_store.set({ blog_comments_markup_attachment: { value: false } });
};
