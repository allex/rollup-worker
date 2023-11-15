import { resolve } from 'path'
import fs from 'fs'

import Debug from 'debug'

import { parseBoolValue, relativeId } from '../utils'
import { handleError, stderr } from '../utils/logging'
import { loadAndParseConfigFile } from '../loadConfigFile'
import { version } from '../index'

import { watch } from './watch'
import build from './build'

interface CommandOptions extends Kv {
  minimize?: boolean;
  watchMode?: boolean;
}

const debug = Debug('rollup-worker:cli')

const runCli = async (): Promise<void> => {
  let configFile = resolve(process.cwd(), '.fssrc.js')

  const argv = process.argv.slice(2)
  const commandOptions: CommandOptions = {}

  const aliases = {
    w: 'watch',
    c: 'config',
    v: 'version',
  }

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
          configFile = resolve(process.cwd(), v)
        }
        break
      case 'compress':
      case 'minimize':
        commandOptions.minimize = parseBoolValue(v, true)
        break
      case 'watch':
        commandOptions.watchMode = v === '' ? true : v
        break
      default:
        handleError(new Error(`Unknow cli options: ${k}`), true)
        break
    }
  }

  if (!configFile || !fs.existsSync(configFile)) {
    let msg: string
    if (!configFile) {
      msg = 'config file required'
    } else {
      msg = `config file "${relativeId(configFile)}" not found.`
    }
    stderr(`
Usage: rb [-w] [--config | -c] <config_file.js>

> ${msg}
`)
    process.exit(1)
  }

  debug('command options: %O', commandOptions)

  if (commandOptions.watchMode) {
    // watch
    await watch(configFile, commandOptions)
  } else {
    // build
    const { options } = await loadAndParseConfigFile(configFile, commandOptions)
    if (commandOptions.minimize !== undefined) {
      options.minimize = commandOptions.minimize
    }
    await build(options)
  }
}

;(async () => {
  try {
    await runCli()
  } catch (e) {
    handleError(e, true)
  }
})()
