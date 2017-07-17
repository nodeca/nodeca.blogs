'use strict';

exports.root = __dirname;
exports.name = 'nodeca.blogs';
exports.init = function (N) { require('./lib/autoload.js')(N); };
