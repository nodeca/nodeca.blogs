'use strict';


module.exports = function (N, apiPath) {

  N.validate(apiPath, {
    user_hid: { type: 'integer', minimum: 1, required: true }
  });

  N.wire.on(apiPath, function update_subscription_type(/*env*/) {
    // TODO
  });
};
