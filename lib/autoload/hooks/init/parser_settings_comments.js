// Create parser settings for blog comments. Use `markup` schema as template.
//
// Note (!) `markup` schema in not used directly, that's a special hidden category.
// Settings are completely independent.
//
// You can override any default property by creating appropriate setting definition directly. Values will be merged.
//
'use strict';


module.exports = function (N) {
  // priority -5 is used to display comment category below entry category in admin pages
  N.wire.before('init:models', { priority: -5 }, function init_blog_comments_parser_settings() {
    const SETTINGS_PREFIX = 'blog_comments_';
    const CATEGORY_KEY = 'blog_comments_markup';
    const GROUP_KEY = 'blogs_editor';

    let settingKey;

    for (let [ key, setting ] of Object.entries(N.config.setting_schemas.markup)) {
      settingKey = SETTINGS_PREFIX + key;

      // Create setting in global schema (if it doesn't exist), fill defaults
      N.config.setting_schemas.global[settingKey] = Object.assign({
        category_key: CATEGORY_KEY,
        group_key: GROUP_KEY
      }, setting, N.config.setting_schemas.global[settingKey]);

      // Copy locale if not exists
      for (let locale of Object.values(N.config.i18n)) {
        if (locale.admin?.core?.setting_names?.[key] && !locale.admin.core.setting_names[settingKey])  {
          locale.admin.core.setting_names[settingKey] = locale.admin.core.setting_names[key];
        }
      }
    }
  });
};
