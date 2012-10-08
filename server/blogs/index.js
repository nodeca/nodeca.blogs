'use strict';

/*global nodeca*/


// Validate input parameters
//
var params_schema = {
};


nodeca.validate(params_schema);


module.exports = function (params, next) {
  this.response.data.req_time = Date.now();
  this.response.layout = 'default.blogs';
  next();
};
