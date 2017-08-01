// Stop blog rebuild
//

'use strict';


module.exports = function (N, apiPath) {
  N.validate(apiPath, {});

  N.wire.on(apiPath, function blogs_rebuild_stop() {
    return N.queue.cancel('blogs_rebuild');
  });
};
