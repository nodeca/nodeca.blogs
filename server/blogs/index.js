'use strict';

/////////////////////////////////////////////////////////////////////////////////


module.exports = function (N, apiPath) {
  N.validate(apiPath, {
  });

  N.wire.on(apiPath, function (env, callback) {
    env.response.data.req_time = Date.now();
    env.response.layout = 'default.blogs';
    callback();
  });
};
