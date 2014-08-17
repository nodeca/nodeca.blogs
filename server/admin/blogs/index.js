'use strict';


module.exports = function (N, apiPath) {
  N.validate(apiPath, {
  });

  N.wire.on(apiPath, function blogs_index(env, callback) {
    env.res.req_time = Date.now();
    callback();
  });
};
