'use strict';


module.exports = function (N, apiPath) {
  N.validate(apiPath, {
  });

  N.wire.on(apiPath, function (env, callback) {
    env.res.req_time = Date.now();
    callback();
  });
};
