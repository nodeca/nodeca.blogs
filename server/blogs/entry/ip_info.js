// Get blog entry IP info
//

'use strict';


const dns     = require('mz/dns');
const whois   = require('whois').lookup;
const Promise = require('bluebird');


module.exports = function (N, apiPath) {

  N.validate(apiPath, {
    entry_id: { format: 'mongo', required: true }
  });


  // Check permissions
  //
  N.wire.before(apiPath, async function check_permissions(env) {
    let can_see_ip = await env.extras.settings.fetch('can_see_ip');

    if (!can_see_ip) throw N.io.FORBIDDEN;
  });


  // Fetch entry IP
  //
  N.wire.on(apiPath, async function fetch_entry_ip(env) {
    let entry = await N.models.blogs.BlogEntry.findById(env.params.entry_id)
                          .select('ip')
                          .lean(true);

    if (!entry) throw N.io.NOT_FOUND;

    if (!entry.ip) {
      throw {
        code: N.io.CLIENT_ERROR,
        message: env.t('err_no_ip')
      };
    }

    env.res.ip = env.data.ip = entry.ip;
  });


  // Fetch whois info
  //
  N.wire.after(apiPath, async function fetch_whois(env) {
    let data = await Promise.fromCallback(cb => whois(env.data.ip, cb));

    env.res.whois = data.replace(/\r?\n/g, '\n')
                        .replace(/^[#%].*/mg, '')     // comments
                        .replace(/^\s+/g, '')         // empty head
                        .replace(/\s+$/g, '')         // empty tail
                        .replace(/[ ]+$/mg, '')       // line tailing spaces
                        .replace(/\n{2,}/g, '\n\n');  // doble empty lines
  });


  // Reverse resolve hostname
  //
  N.wire.after(apiPath, async function reverse_resolve(env) {

    try {
      // this error is not fatal
      let hosts = await dns.reverse(env.data.ip);

      if (hosts.length) {
        env.res.hostname = hosts[0];
      }
    } catch (__) {}
  });
};
