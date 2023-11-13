/**
 * Rollup worker for bundle multiple entry
 *
 * MIT Licensed
 *
 * Authors:
 *   Allex Wang <allex.wxn@gmail.com> (http://iallex.com/)
 */

import Debug from 'debug'
import { basename, resolve } from 'path'
import prettyBytes from 'pretty-bytes'
import prettyMs from 'pretty-ms'
import rollup, { ExternalOption, InputOptions, IsExternal, MergedRollupOptions, ModuleFormat, OutputOptions, RollupBuild, RollupOutput, RollupWatchOptions, WatcherOptions } from 'rollup'
import { find, isArray, isFunction, isObject, isString, sequence } from '@fdio/utils'

import { initPlugin } from './plugins/plugin-loader'
import { asArray, relativeId } from './utils'
import { stderr } from './utils/logging'

import { bold, cyan, green } from './utils/colors'
import configLoader from './utils/configLoader'
import { BundlerEntry, BundlerInputOptions, BundlerOutputOptions, NormalizedBundlerOptions } from './types'

export { version } from '../package.json'
export { loadConfigFile } from './loadConfigFile'

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
  constructor (options: NormalizedBundlerOptions) {
    if (!options) {
      throw new Error('Illegal bundler configs')
    }

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
          options[k] = deps.some(k => new RegExp(`\b${k}\b`).test(k))
        }
      })
    }

    this.options = options
  }

  private checkExternal (id: string, input: InputOptions) {
    const targets = input.dependencies || this.options.dependencies || []
    const list = isArray(targets)
      ? targets
      : Object.keys(targets).filter(k => targets[k] !== false)
    for (const item of list) {
      // pattern match by word and suffix checks
      if (id === item || id.startsWith(item)) {
        return true
      }
    }
    return false
  }

  private createConfig(out: BundlerOutputOptions, input: BundlerInputOptions): MergedRollupOptions {
    const {
      rootDir
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
        if (p && !list.some(n => isString(n) ? n === p : n.name === p)) list.push(p)
        return list
      }, [...(commonPlugins.length ? commonPlugins : zeroConfigPlugins)])
      .map(p => initPlugin(p, pluginCtx))
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
      format: (modern ? 'es' : format) as ModuleFormat
    }

    // resolve output file with base dir
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
        if (name && !find(inputPlugins, (o) => o === p || name && (o === name || o.name === name))) {
          arr.push(p)
        }
        return arr
      }, [])
      .map(p => initPlugin(p, pluginCtx))
      .filter(Boolean)

    return {
      ...inputOptions,
      output: [outputOptions]
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

    return asArray(output).map(o => this.createConfig(o, inputOptions))
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
          ? (id, importer, isResolved) => externalImpl(id, importer, isResolved, () => defaultExternalFn(id, importer, isResolved))
          : externalImpl)
  }

  getEntries() {
    return this.options.entry.reduce<MergedRollupOptions[]>((p, o) => p.concat(this.normalizeEntry(o)), [])
  }

  buildEntry (entry: BundlerEntry) {
    const list = this.normalizeEntry(entry)

    debug('normalized entries: \n%O', list)

    let inputs: string[] = []
    const input = entry.input
    if (isObject(input)) {
      inputs = Object.values(input)
    } else {
      inputs = asArray(input as Many<string>)
    }

    return sequence(list, async ({ output, ...input }): Promise<RollupBuild> => {
      const start = Date.now()
      const files = output.map((o) => relativeId(o.file || o.dir))

      stderr(cyan(`build ${bold(inputs.map(p => relativeId(p)).join(','))} \u2192 ${bold(files.join(', '))} ...`))
      const bundle: RollupBuild = await rollup.rollup(input)

      for (const o of output) {
        const out: RollupOutput = await bundle.write(o)
        stderr(green(`created ${bold(relativeId(o.file || o.dir))} (${prettyBytes(out.output.filter(o => o.code).reduce((n, o) => n + o.code.length, 0))}) in ${bold(prettyMs(Date.now() - start))}`))
      }

      return bundle
    })
  }

  async build () {
    return sequence(this.options.entry, o => this.buildEntry(o))
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
