#!/usr/bin/env node
'use strict';

function _interopDefault (ex) { return (ex && (typeof ex === 'object') && 'default' in ex) ? ex['default'] : ex; }

var p = _interopDefault(require('path'));
var fs = _interopDefault(require('fs'));
var Worker = _interopDefault(require('../'));

var argv = process.argv.slice(2);
var configFile = p.resolve(process.cwd(), '.rolluprc.js');

while (argv.length) {
  var k = argv.shift(),
      v = argv[0];

  switch (k) {
    case '-c':
    case '--config':
      if (v) {
        configFile = p.resolve(process.cwd(), v);
      }

      break;
  }
}

if (!configFile || !fs.existsSync(configFile)) {
  console.error('config file not valid. \n rollup-bundle --config <config_file.js> \n(exit 1)');
  process.exit(1);
}

var build = function build(configs) {
  return new Worker(configs).build();
};

Worker.loadConfigFile(configFile).then(function (configs) {
  configs = configs.map(function (o) {
    return o.rollup || o;
  });

  if (configs.some(function (o) {
    return o.entry;
  })) {
    configs = configs[0];
  }

  return build(configs);
}).catch(function (e) {
  console.error(e);
  process.exit(1);
});

module.exports = build;
