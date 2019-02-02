import fs from 'fs'
import p from 'path'

import { loadConfigFile, Rollup, version } from 'rollup-worker'
import { stderr } from '../logging'
import { relativeId } from '../utils'
import watch from './watch'

const argv = process.argv.slice(2)
let configFile = p.resolve(process.cwd(), '.fssrc.js')
let watchMode = false

// parse --config from argv
while (argv.length) {
  const k = argv.shift(), v = argv[0]
  switch (k) {
    case '--version':
      stderr(`v${version}`)
      process.exit(1)
      break
    case '-c':
    case '--config':
      if (v && v.charAt(0) !== '-') {
        configFile = p.resolve(process.cwd(), v)
        argv.shift()
      }
      break
    case '-w':
      watchMode = true
      break
  }
}

if (!configFile || !fs.existsSync(configFile)) {
  let msg
  if (!configFile) {
    msg = 'config file required'
  } else {
    msg = `config file "${relativeId(configFile)}" not found.`
  }
  stderr(`
Usage: rollup-bundle [-w] [--config | -c] <config_file.js>

> ${msg}
`
  )
  process.exit(1)
}

const build = configs => new Rollup(configs).build()

loadConfigFile(configFile)
  .then((configs) => {
    configs = configs.map(o => o.rollup || o)
    if (configs.some(o => o.entry)) {
      configs = configs[0]
    }
    if (watchMode) {
      watch(configFile, configs)
    } else {
      // build
      return build(configs)
    }
  })
  .catch((e) => fatal(e))

function fatal(message) {
  if (message instanceof Error) message = message.stack.replace(/^\S*?Error:/, "ERROR:")
  stderr(message);
  process.exit(1);
}

export { build, watch }
