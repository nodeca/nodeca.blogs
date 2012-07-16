'use strict';

/*global nodeca*/

module.exports = function (params, next) {
  this.response.data.req_time = Date.now();
  this.response.layout = 'default.blogs';
  next();
};
