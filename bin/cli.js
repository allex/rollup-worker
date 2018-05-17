#!/usr/bin/env node

const p = require('path')
const fs = require('fs')
const Rollup = require('../')

let argv = process.argv.slice(2)
let configFile = p.resolve(process.cwd(), '.rolluprc.js')

// parse --config from argv
while (argv.length) {
  var k = argv.shift(), v = argv[0]
  switch (k) {
    case '-c':
    case '--config':
      if (v) {
        configFile = p.resolve(process.cwd(), v)
      }
      break
  }
}

if (!configFile || !fs.existsSync(configFile)) {
  console.error('config file not valid. \n rollup-bundle --config <config_file.js> \n(exit 1)')
  process.exit(1)
}

Rollup.loadConfigFile(configFile)
  .then(function (configs) {
    configs = configs.map(o => o.rollup || o)
    if (configs.some(o => o.entry)) {
      configs = configs[0]
    }
    // build
    return new Rollup(configs).build()
  })
  .catch(function (e) {
    console.error(e)
    process.exit(1)
  })
