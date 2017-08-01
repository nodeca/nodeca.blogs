// Start blog rebuild
//

'use strict';


module.exports = function (N, apiPath) {
  N.validate(apiPath, {});

  N.wire.on(apiPath, function blogs_rebuild_start() {
    return N.queue.blogs_rebuild().run();
  });
};
