import { promises as fs, type FSWatcher } from 'fs'

import dateTime from 'date-time'
import ms from 'pretty-ms'
import onExit from 'signal-exit'
import chokidar from 'chokidar'
import { RollupWatcher } from 'rollup'

import { Bundler, version } from '../index'
import { relativeId } from '../utils'
import { BatchWarnings } from '../utils/batchWarnings'
import {
  bold, cyan, green, underline,
} from '../utils/colors'
import { handleError, stderr } from '../utils/logging'
import { NormalizedBundlerOptions } from '../types'
import { loadAndParseConfigFile } from '../loadConfigFile'
import { printTimings } from '../utils/timings'

import { createWatchHooks } from './watchHooks'
import { getResetScreen } from './resetScreen'

export async function watch (configFile: string, command: Kv): Promise<void> {
  process.env.ROLLUP_WATCH = 'true'
  const isTTY = process.stderr.isTTY
  const silent = command.silent
  let watcher: RollupWatcher
  let configWatcher: FSWatcher
  let resetScreen: (heading: string) => void
  const runWatchHook = createWatchHooks(command)

  onExit(close)
  process.on('uncaughtException', close)
  if (!process.stdin.isTTY) {
    process.stdin.on('end', close)
    process.stdin.resume()
  }

  async function loadConfigFromFileAndTrack (configFile: string): Promise<void> {
    let configFileData: string | null = null
    let configFileRevision = 0

    configWatcher = chokidar.watch(configFile).on('change', reloadConfigFile)
    await reloadConfigFile()

    async function reloadConfigFile () {
      try {
        const newConfigFileData = await fs.readFile(configFile, 'utf8')
        if (newConfigFileData === configFileData) {
          return
        }
        configFileRevision++
        const currentConfigFileRevision = configFileRevision
        if (configFileData) {
          stderr('\nReloading updated config...')
        }
        configFileData = newConfigFileData
        const { options, warnings } = await loadAndParseConfigFile(configFile, command)
        if (currentConfigFileRevision !== configFileRevision) {
          return
        }
        if (watcher) {
          await watcher.close()
        }
        start(options, warnings)
      } catch (err: any) {
        handleError(err, true)
      }
    }
  }

  await loadConfigFromFileAndTrack(configFile)

  async function start (options: NormalizedBundlerOptions, warnings: BatchWarnings): Promise<void> {
    const bundler = new Bundler(options)
    try {
      watcher = await bundler.watch()
    } catch (err: any) {
      return handleError(err)
    }

    watcher.on('event', event => {
      switch (event.code) {
        case 'ERROR':
          warnings.flush()
          handleError(event.error, true)
          runWatchHook('onError')
          break

        case 'START':
          if (!silent) {
            if (!resetScreen) {
              resetScreen = getResetScreen(bundler.getEntries() as any, isTTY)
            }
            resetScreen(underline(`rollup-worker v${version}`))
          }
          runWatchHook('onStart')
          break

        case 'BUNDLE_START':
          if (!silent) {
            let input = event.input
            if (typeof input !== 'string') {
              input = Array.isArray(input)
                ? input.join(', ')
                : Object.values(input as Record<string, string>).join(', ')
            }
            stderr(
              cyan(`bundles ${bold(input)} → ${bold(event.output.map(relativeId).join(', '))}...`),
            )
          }
          runWatchHook('onBundleStart')
          break

        case 'BUNDLE_END':
          warnings.flush()
          if (!silent) {
            stderr(
              green(
                `created ${bold(event.output.map(relativeId).join(', '))} in ${bold(
                  ms(event.duration),
                )}`,
              ),
            )
          }
          runWatchHook('onBundleEnd')
          if (event.result && event.result.getTimings) {
            printTimings(event.result.getTimings())
          }
          break

        case 'END':
          runWatchHook('onEnd')
          if (!silent && isTTY) {
            stderr(`\n[${dateTime()}] waiting for changes...`)
          }
          break

        default:
          break
      }

      if ('result' in event && event.result) {
        event.result.close().catch(error =>
          handleError(error, true))
      }
    })
  }

  async function close (code: number | null): Promise<void> {
    process.removeListener('uncaughtException', close)
    // removing a non-existent listener is a no-op
    process.stdin.removeListener('end', close)

    if (watcher) await watcher.close()
    if (configWatcher) configWatcher.close()

    if (code) {
      process.exit(code)
    }
  }
}
