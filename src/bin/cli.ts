import fs from 'fs'

import Debug from 'debug'

import { parseBoolValue, relativeId } from '../utils'
import { handleError, stderr } from '../utils/logging'
import { loadAndParseConfigFile } from '../loadConfigFile'
import { version } from '../index'

import { watch } from './watch'
import build from './build'
import { getConfigPath } from './getConfigPath'

const HELP_FLG_OK = 0x1
const HELP_FLG_ERR = 0x2

interface CommandOptions extends Kv {
  minimize?: boolean;
  watchMode?: boolean;
  showHelp?: number;
  /**
   * `true` means auto detect fssrc configs
   */
  config: true | string;
}

const debug = Debug('rollup-worker:cli')

const showUsage = () => {
  stderr(`A micro bundler for front-end project (based on rollup)

Usage:
 rb <options> <parameters>

Options:
 -c, --config <config_file>   the bundler config file. (default to .fssrc.ts, .fssrc.js)
 -w, --watch                  watch mode

 -v, --version                show version
 -h, --help                   show this help message
`)
}

const runCli = async (): Promise<void> => {
  const argv = process.argv.slice(2)
  const commandOptions: CommandOptions = {
    showHelp: 0,
    config: true,
  }

  const aliases = {
    w: 'watch',
    c: 'config',
    v: 'version',
    h: 'help',
  }

  // parse command args
  while (argv.length) {
    let k: string = argv.shift()
    let v: string = argv[0] || ''

    // keep any remaining arguments to the positional parameters
    if (k === '--') {
      break
    }

    if (k.indexOf('-') !== 0) {
      commandOptions.showHelp |= HELP_FLG_ERR
      break
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
          commandOptions.configFile = v
        }
        break
      case 'compress':
      case 'minimize':
        commandOptions.minimize = parseBoolValue(v, true)
        break
      case 'watch':
        commandOptions.watchMode = v === '' ? true : parseBoolValue(v)
        break
      case 'help':
        commandOptions.showHelp |= HELP_FLG_OK
        break
      default:
        handleError(new Error(`Unknow cli options: ${k}`))
        break
    }
  }

  if (commandOptions.showHelp > 0) {
    showUsage()
    process.exit(commandOptions.showHelp & HELP_FLG_ERR)
  }

  debug('command options: %O', commandOptions)

  const configFile = await getConfigPath(commandOptions.config)

  debug('config: %s', configFile)

  if (!configFile || !fs.existsSync(configFile)) {
    let msg: string
    if (!configFile) {
      msg = 'fatal: config file required'
    } else {
      msg = `fatal: config file "${relativeId(configFile)}" not found.`
    }
    handleError(new Error(msg))
  }

  if (commandOptions.watchMode) {
    // watch
    await watch(configFile, commandOptions)
  } else {
    // build
    const { options, warnings } = await loadAndParseConfigFile(configFile, commandOptions)
    if (commandOptions.minimize !== undefined) {
      options.minimize = commandOptions.minimize
    }
    await build(options, warnings)
  }
}

;(async () => {
  try {
    await runCli()
  } catch (e) {
    handleError(e)
  }
})()
