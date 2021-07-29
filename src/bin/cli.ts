import Debug from 'debug'
import fs from 'fs'
import p from 'path'

import { Bundler, loadConfigFile, version } from '../index'

import { relativeId } from '../utils'
import { stderr } from '../utils/logging'

import watch from './watch'

interface CommandOptions {
  compress?: boolean;
  watchMode?: boolean;
}

const debug = Debug('rollup-worker:cli')

let configFile = p.resolve(process.cwd(), '.fssrc.js')

const argv = process.argv.slice(2)
const commandOptions: CommandOptions = {}

const boolValues = {
  yes: true,
  no: false,
  true: true,
  false: false,
  on: true,
  off: true
}

const aliases = {
  w: 'watch',
  c: 'config'
}

const parseBoolValue = (v: string): boolean | null => boolValues.hasOwnProperty(v) ? boolValues[v] : null
const defaultTo = <T> (v: any, defval: T): T => v != null ? v as T : defval

// parse command args
while (argv.length) {
  let k: string = argv.shift()
  let v: any = argv[0] || ''

  // keep any remaining arguments to the positional parameters
  if (k === '--') {
    break
  }

  if (k.indexOf('-') !== 0) {
    continue
  }

  // parse k/v tuple, eg. --compress=false
  const match = /(\w+)=(\w+)/.exec(k)
  if (match) {
    k = match[1]
    v = match[2]
  }

  if (v.indexOf('-') === 0) {
    v = ''
  } else {
    argv.shift()
  }

  k = k.replace(/^--?/, '')
  k = aliases[k] || k

  switch (k) {
    case 'version':
      stderr(`v${version}`)
      process.exit(1)
      break
    case 'config':
      if (v) {
        configFile = p.resolve(process.cwd(), v)
      }
      break
    case 'compress':
      commandOptions.compress = defaultTo(parseBoolValue(v), true)
      break
    case 'watch':
      commandOptions.watchMode = v === '' ? true : v
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
Usage: rb [-w] [--config | -c] <config_file.js>

> ${msg}
`
  )
  process.exit(1)
}

const build = configs => new Bundler(configs).build()

loadConfigFile(configFile)
  .then(configs => {
    const nargs: Kv = {}

    const compress = commandOptions.compress
    if (compress !== undefined) {
      nargs.compress = compress
    }

    configs = configs.map(o => ({ ...(o.rollup || o), ...nargs }))

    debug('configs => \n%O', configs)

    if (configs.some(o => o.entry)) {
      configs = configs[0]
    }

    if (commandOptions.watchMode) {
      watch(configFile, configs)
    } else {
      // build
      return build(configs)
    }
  })
  .catch(e => fatal(e))

function fatal (message) {
  if (message instanceof Error) message = message.stack.replace(/^\S*?Error:/, 'ERROR:')
  stderr(message)
  process.exit(1)
}

export { build, watch }
