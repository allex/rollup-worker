import dateTime from 'date-time'
import prettyMs from 'pretty-ms'
import signalExit from 'signal-exit'

import { Bundler, version } from '../index'
import { relativeId } from '../utils'
import batchWarnings from '../utils/batchWarnings'
import { bold, cyan, green, underline } from '../utils/colors'
import { handleError, stderr } from '../utils/logging'

import alternateScreen from './alternateScreen'
import { printTimings } from './timings'

function watch (configFile: string, configs: {}, silent = false) {
  console.log(configFile, configs, silent)

  const isTTY = Boolean(process.stderr.isTTY)

  const processConfigs = configs => {
    return configs
  }

  const warnings = batchWarnings()
  const initialConfigs = processConfigs(configs)
  const clearScreen = [initialConfigs].every(config => (config.watch || 0).clearScreen !== false)

  const screen = alternateScreen(isTTY && clearScreen)
  screen.open()

  let watcher

  function start (configs) {
    screen.reset(underline('rollup-worker v' + version))
    const screenWriter = configs.processConfigsErr || screen.reset
    watcher = new Bundler(configs).watch()
    watcher.on('event', event => {
      switch (event.code) {
        case 'FATAL':
          screen.close()
          handleError(event.error, true)
          process.exit(1)
          break
        case 'ERROR':
          warnings.flush()
          handleError(event.error, true)
          break
        case 'START':
          screenWriter(underline('rollup-worker v' + version))
          break
        case 'BUNDLE_START':
          if (!silent) {
            let input = event.input
            if (typeof input !== 'string') {
              input = Array.isArray(input)
                ? input.join(', ')
                : Object.keys(input)
                  .map(key => input[key])
                  .join(', ')
            }
            stderr(cyan(`bundles ${bold(relativeId(input))} \u2192 ${bold(event.output.map(relativeId).join(', '))}...`))
          }
          break
        case 'BUNDLE_END':
          warnings.flush()
          if (!silent) { stderr(green(`created ${bold(event.output.map(relativeId).join(', '))} in ${bold(prettyMs(event.duration))}`)) }
          if (event.result && event.result.getTimings) {
            printTimings(event.result.getTimings())
          }
          break
        case 'END':
          if (!silent && isTTY) {
            stderr(`\n[${dateTime()}] waiting for changes...`)
          }
      }
    })
  }

  function close (err) {
    removeOnExit()
    process.removeListener('uncaughtException', close)
    // removing a non-existent listener is a no-op
    process.stdin.removeListener('end', close)
    screen.close()
    if (watcher) { watcher.close() }
    if (err) {
      stderr(err)
      process.exit(1)
    }
  }

  // catch ctrl+c, kill, and uncaught errors
  const removeOnExit = signalExit(close)
  process.on('uncaughtException', close)

  // only listen to stdin if it is a pipe
  if (!process.stdin.isTTY) {
    process.stdin.on('end', close) // in case we ever support stdin!
    process.stdin.resume()
  }

  start(initialConfigs)
}

export default watch
