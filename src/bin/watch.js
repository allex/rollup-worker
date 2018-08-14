import chalk from 'chalk'
import prettyMs from 'pretty-ms'
import signalExit from 'signal-exit'
import dateTime from 'date-time'
import alternateScreen from './alternateScreen'
import { relativeId } from '../utils'
import { stderr, handleError } from '../logging'
import batchWarnings from '../batchWarnings'
import { printTimings } from './timings'

import { Rollup, version }  from 'rollup-worker'

const debug = require('debug')('rollup-worker:watch')

function watch (configFile, configs, command, silent = false) {
  var isTTY = Boolean(process.stderr.isTTY)

  const processConfigs = (configs) => {
    return configs
  }

  var warnings = batchWarnings()
  var initialConfigs = processConfigs(configs)
  var clearScreen = [ initialConfigs ].every(function (config) { return (config.watch || 0).clearScreen !== false })

  var screen = alternateScreen(isTTY && clearScreen)
  screen.open()

  var watcher
  var configWatcher
  var processConfigsErr

  function start (configs) {
    screen.reset(chalk.underline('rollup-worker v' + version))
    var screenWriter = processConfigsErr || screen.reset
    watcher = new Rollup(configs).watch()
    watcher.on('event', function (event) {
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
          screenWriter(chalk.underline('rollup-worker v' + version))
          break
        case 'BUNDLE_START':
          if (!silent) {
            var input = event.input
            if (typeof input !== 'string') {
              input = Array.isArray(input)
                ? input.join(', ')
                : Object.keys(input)
                  .map(function (key) { return input[key] })
                  .join(', ')
            }
            stderr(chalk.cyan('bundles ' + chalk.bold(relativeId(input)) + ' \u2192 ' + chalk.bold(event.output.map(relativeId).join(', ')) + '...'))
          }
          break
        case 'BUNDLE_END':
          warnings.flush()
          if (!silent) { stderr(chalk.green('created ' + chalk.bold(event.output.map(relativeId).join(', ')) + ' in ' + chalk.bold(prettyMs(event.duration)))) }
          if (event.result && event.result.getTimings) {
            printTimings(event.result.getTimings())
          }
          break
        case 'END':
          if (!silent && isTTY) {
            stderr('\n[' + dateTime() + '] waiting for changes...')
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
    if (configWatcher) { configWatcher.close() }
    if (err) {
      stderr(err)
      process.exit(1)
    }
  }

  // catch ctrl+c, kill, and uncaught errors
  var removeOnExit = signalExit(close)
  process.on('uncaughtException', close)

  // only listen to stdin if it is a pipe
  if (!process.stdin.isTTY) {
    process.stdin.on('end', close) // in case we ever support stdin!
    process.stdin.resume()
  }

  start(initialConfigs)
}

export default watch
