#!/usr/bin/env node

const p = require('path')
const fs = require('fs')
const Rollup = require('../')

let argv = process.argv.slice(2)
let configFile = p.resolve(process.cwd(), '.rolluprc.js')

// parse --config from argv
while (argv.length) {
  var k = argv.shift(), v = argv[0]
  if (k === '--config') {
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

let config = require(configFile)

config = config.rollup || config

// build
new Rollup(config).build().catch((e) => {
  console.error(e)
  process.exit(1)
})

function red (str) {
  return `\x1B[31m${str}\x1B[0m`
}
