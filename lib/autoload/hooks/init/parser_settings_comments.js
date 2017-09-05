// Create parser settings for blog comments. Use `markup` schema as template.
//
// Note (!) `markup` schema in not used directly, that's a special hidden category.
// Settings are completely independent.
//
// You can override any default property by creating appropriate setting definition directly. Values will be merged.
//
'use strict';


const _ = require('lodash');


module.exports = function (N) {
  // priority -5 is used to display comment category below entry category in admin pages
  N.wire.before('init:models', { priority: -5 }, function init_blog_comments_parser_settings() {
    const SETTINGS_PREFIX = 'blog_comments_';
    const CATEGORY_KEY = 'blog_comments_markup';
    const GROUP_KEY = 'blogs_editor';

    let settingKey;

    _.forEach(N.config.setting_schemas.markup, (setting, key) => {
      settingKey = SETTINGS_PREFIX + key;

      // Create setting in global schema if not exists
      if (!N.config.setting_schemas.global[settingKey]) {
        N.config.setting_schemas.global[settingKey] = {};
      }

      // Fill defaults for setting
      _.defaults(N.config.setting_schemas.global[settingKey], setting, {
        category_key: CATEGORY_KEY,
        group_key: GROUP_KEY
      });

      // Copy locale if not exists
      _.forEach(N.config.i18n, locale => {
        let from = `admin.core.setting_names.${key}`;
        let to = `admin.core.setting_names.${settingKey}`;

        if (!_.has(locale, to) && _.has(locale, from)) {
          _.set(locale, to, _.get(locale, from));
        }
      });
    });
  });
};
