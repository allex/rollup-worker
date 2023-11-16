/**
 * Rollup worker for bundle multiple entry
 *
 * MIT Licensed
 *
 * Authors:
 *   Allex Wang <allex.wxn@gmail.com> (http://iallex.com/)
 */

import { basename, resolve } from 'path'

import Debug from 'debug'
import ms from 'pretty-ms'
import rollup, {
  ExternalOption,
  InputOptions,
  IsExternal,
  MergedRollupOptions,
  ModuleFormat,
  OutputOptions,
  RollupBuild,
  RollupWatchOptions,
  WatcherOptions,
} from 'rollup'
import {
  find, isArray, isFunction, isObject, isString, sequence,
} from '@fdio/utils'

import { initPlugin } from './plugins/plugin-loader'
import { asArray, relativeId } from './utils'
import { stderr } from './utils/logging'
import { bold, cyan, green } from './utils/colors'
import configLoader from './utils/configLoader'
import {
  BundlerEntry, BundlerInputOptions, BundlerOutputOptions, NormalizedBundlerOptions,
} from './types'
import { BatchWarnings } from './utils/batchWarnings'
import { printTimings } from './utils/timings'

export { version } from '../package.json'

declare module 'rollup' {
  interface InputOptions {
    dependencies?: string[];
  }
  interface OutputOptions {
    minimize?: boolean;
  }
}

type NpmPackage = Record<'dependencies' | 'devDependencies' | 'peerDependencies', Kv<string>>

const debug = Debug('rollup-worker:bundler')

// default plugins (for zero config)
const zeroConfigPlugins = ['babel', 'resolve', 'commonjs']

// some builtin plugins
const builtinPlugins = ['json', 'replace']

export class Bundler {
  options: NormalizedBundlerOptions

  /**
   * Multi-entry config for rollup bundle
   *
   * @constructor
   * @param {Object} config The config for multiple bundle
   */
  constructor (opts: NormalizedBundlerOptions) {
    if (!opts) {
      throw new Error('Illegal bundler configs')
    }

    const options = { ...opts }

    // Normalized bundler options
    options.rootDir = resolve(options.rootDir || '.')
    options.destDir = resolve(options.rootDir, options.destDir || './lib')

    this.init(options)
  }

  private init (opts: NormalizedBundlerOptions) {
    const options = { ...opts }

    // resolve project package.json
    const pkg = configLoader.load<NpmPackage>({ files: ['package.json'], cwd: options.rootDir })

    // Auto detect [vue, react] by parse package dependencies
    if (pkg?.data) {
      const { dependencies, devDependencies } = pkg.data
      const deps = Object.keys({ ...dependencies, ...devDependencies })
        ;['vue', 'react'].forEach(k => {
        if (!options[k] == null) {
          options[k] = deps.some(k =>
            new RegExp(`\b${k}\b`).test(k))
        }
      })
    }

    this.options = options
  }

  private checkExternal (id: string, input: InputOptions) {
    const targets = input.dependencies || this.options.dependencies || []
    const list = isArray(targets)
      ? targets
      : Object.keys(targets).filter(k =>
        targets[k] !== false)
    for (const item of list) {
      // pattern match by word and suffix checks
      if (id === item || id.startsWith(item)) {
        return true
      }
    }
    return false
  }

  private createConfig (out: BundlerOutputOptions, input: BundlerInputOptions): MergedRollupOptions {
    const {
      rootDir,
    } = this.options

    const {
      globals,
      plugins: commonPlugins = [],
      external: customExternalFunc,
      ...inputRest
    } = input

    const format: string = out.format
    const modern = format === 'modern'

    const pluginCtx = { input: input.input, output: out, options: this.options }

    // init plugins: merge with builtin and cleanup
    const inputPlugins = builtinPlugins
      .reduce((list, p) => {
        if (p && !list.some(n =>
          (isString(n) ? n === p : n.name === p))) list.push(p)
        return list
      }, [...(commonPlugins.length ? commonPlugins : zeroConfigPlugins)])
      .map(p =>
        initPlugin(p, pluginCtx))
      .filter(Boolean)

    const inputOptions: InputOptions = {
      ...inputRest,
      plugins: inputPlugins,
      external: this.proxyExternal(customExternalFunc, inputRest),
    }

    // extract some extends fields
    const {
      minimize,
      plugins: outputPlugins = [],
      ...rest
    } = out

    // construct output as {rollup.OutputOptions}
    const outputOptions: OutputOptions = {
      ...rest,
      globals,
      indent: '  ',
      format: (modern ? 'es' : format) as ModuleFormat,
    }

    // resolve output file with base dir
    // eslint-disable-next-line semi-style
    ;['file', 'dir'].forEach(prop => {
      if (outputOptions[prop]) {
        outputOptions[prop] = resolve(rootDir, outputOptions[prop])
      }
    })

    // default to compress (except as configure this option explicitly)
    let enableMinimize = this.options.compress !== false
      && this.options.minimize !== false

    const { file } = outputOptions
    if (file) {
      // enable minimize by the default
      if (minimize !== undefined) {
        enableMinimize = !!minimize
      } else if (/\.min\./.test(basename(file))) {
        // enable minimize when out file suffixed `*.min.*` pattern
        enableMinimize = true
      }
    }

    // Add compress based on terser
    if (enableMinimize) {
      outputPlugins.push('minimize')
    }

    // init output plugins, exclude plugins in inputs
    outputOptions.plugins = outputPlugins
      .reduce((arr, p) => {
        const name = isString(p)
          ? p
          : typeof p === 'object' ? p.name : p
        // avoid duplicates plugins which in input.plugins already
        if (name && !find(inputPlugins, (o) =>
          o === p || (name && (o === name || o.name === name)))) {
          arr.push(p)
        }
        return arr
      }, [])
      .map(p =>
        initPlugin(p, pluginCtx))
      .filter(Boolean)

    return {
      ...inputOptions,
      output: [outputOptions],
    }
  }

  /**
   * Normalize bundler config for std rollup.InputOptions
   */
  private normalizeEntry (entry: BundlerEntry): MergedRollupOptions[] {
    const {
      output = [],
      ...inputOptions
    } = entry

    return asArray(output).map(o =>
      this.createConfig(o, inputOptions))
  }

  proxyExternal (externalImpl: BundlerEntry['external'], inputs: InputOptions): ExternalOption {
    // default external func
    const defaultExternalFn: IsExternal = (id, _importer, isResolved) => {
      if (isResolved || id === 'babel-plugin-transform-async-to-promises/helpers') {
        return false
      }
      return this.checkExternal(id, inputs)
    }

    return !externalImpl
      ? defaultExternalFn
      : (
        isFunction(externalImpl)
          ? (id, importer, isResolved) =>
            externalImpl(id, importer, isResolved, () =>
              defaultExternalFn(id, importer, isResolved))
          : externalImpl)
  }

  getEntries () {
    return this.options.entry.reduce<MergedRollupOptions[]>((p, o) =>
      p.concat(this.normalizeEntry(o)), [])
  }

  private buildEntry (entry: BundlerEntry, warnings: BatchWarnings, silent = false): Promise<void> {
    const list = this.normalizeEntry(entry)

    debug('normalized entries: \n%O', list)

    let inputs: string[] = []
    const input = entry.input
    if (isObject(input)) {
      inputs = Object.values(input)
    } else {
      inputs = asArray(input as Many<string>)
    }
    const files = entry.output.map(o => {
      const dst = (o.file ?? o.dir) || ''
      return relativeId(dst)
    })

    if (!silent) {
      stderr(cyan(`build ${bold(inputs.map(p =>
        relativeId(p)).join(','))} \u2192 ${bold(files.join(', '))} ...`))
    }

    return sequence(list, async (inputOptions): Promise<void> => {
      const outputOptions = inputOptions.output
      if (!outputOptions.length) {
        throw new Error('invalid rollup config, output cannot be nil')
      }

      const start = Date.now()
      const bundle: RollupBuild = await rollup.rollup(inputOptions)

      for await (const output of outputOptions) {
        const { output: out } = await bundle.write(output)
        if (!silent) {
          const files = out
            .filter(o => o.type === 'chunk')
            .map(o => relativeId(o.fileName))
          warnings.flush()
          stderr(green(`created ${bold(files.join(', '))} in ${bold(ms(Date.now() - start))}`))
          if (bundle && bundle.getTimings) {
            printTimings(bundle.getTimings())
          }
        }
      }

      await bundle.close()
    })
  }

  async build (warnings: BatchWarnings) {
    return sequence(this.options.entry, o =>
      this.buildEntry(o, warnings))
  }

  async watch (options?: WatcherOptions) {
    const watchOptions: RollupWatchOptions[] = []

    this.options.entry.forEach(entry => {
      const list = this.normalizeEntry(entry)
      list.forEach(input => {
        watchOptions.push({ watch: options, ...input })
      })
    })

    return rollup.watch(watchOptions)
  }
}
