/**
 * Rollup worker for bundle multiple entry
 *
 * MIT Licensed
 *
 * Authors:
 *   Allex Wang <allex.wxn@gmail.com> (http://iallex.com/)
 */

import chalk from 'chalk'
import Debug from 'debug'
import { basename, resolve } from 'path'
import prettyBytes from 'pretty-bytes'
import prettyMs from 'pretty-ms'
import rollup, { InputOption, InputOptions, OutputOptions, RollupBuild, RollupOutput } from 'rollup'

import {
  defaultTo, find, isArray, isEmpty, isFunction, omit, sequence
} from '@fdio/utils'

import { createPlugin } from './plugins'
import { mergeArray, relativeId } from './utils'
import { stderr } from './utils/logging'

import configLoader from './utils/configLoader'

export { version } from '../package.json'
export { loadConfigFile } from './loadConfigFile'

export interface BundlerEntry {
  input: InputOption;
  targets?: OutputOptions; // deprecated
  output: OutputOptions;
  plugins: Kv;
  globals: Kv;
  external: (id: string, format: string, defaultFn: any) => boolean | Kv<string>;
}

export interface BundlerOptions {
  rootDir?: string; // default `./`
  destDir?: string; // default `./lib`
  plugins?: object;
  pluginOptions?: object; // deprecated
  dependencies?: Kv;
  entry: BundlerEntry[];
  compress?: boolean;
  sourcemap?: boolean;
  jsx?: string;
  jsxFragment?: string;
  target?: 'web' | 'node';
  vue?: boolean;
  react?: boolean;
}

type RollupContextOptions = Omit<BundlerOptions, 'entry'>

const debug = Debug('rollup-worker')

// default plugins (for zero config)
const zeroConfigPlugins = ['babel', 'resolve', 'commonjs']

// some builtin plugins
const builtinPlugins = ['json', 'replace']

const isNativeRollupConfig = o => (isArray(o) ? o : [o]).some(o => !!(o.input && o.output))

const transformFromRollupConfig = (o: object): BundlerOptions => {
  return {
    entry: isArray(o) ? o : [o]
  }
}

export interface RollupContext extends InputOptions {
  output: OutputOptions;
  options: RollupContextOptions;
}

export class Bundler {
  config: BundlerOptions

  /**
   * Multi-entry config for rollup bundle
   *
   * @constructor
   * @param {Object} config The config for multiple bundle
   */
  constructor (options: BundlerOptions) {
    if (!options) {
      throw new Error('Illegal constructor arguments.')
    }

    // Adapter options is a native rollup configs
    if (isNativeRollupConfig(options)) {
      options = transformFromRollupConfig(options)
    }

    const entry = options.entry
    if (!entry) {
      throw new Error('`entry` not valid')
    }

    if (!isArray(entry)) {
      options.entry = [entry as BundlerEntry]
    }

    const config = {
      plugins: {}, // settings for default plugins
      ...options
    }

    if (config.pluginOptions) {
      stderr('rb config `pluginOptions` deprecated, use `plugins` instead')
      if (isEmpty(config.plugins)) {
        config.plugins = config.pluginOptions
      }
    }

    config.rootDir = resolve(config.rootDir || '.')
    config.destDir = resolve(config.destDir || './lib')

    this.config = config
    this.rootDir = config.rootDir
  }

  async _init () {
    const { config } = this

    // resolve project package.json
    const pkg = await configLoader.load({
      files: ['package.json'],
      cwd: config.rootDir
    }) || {}

    // Auto detect [vue, react] by parse package dependencies
    if (pkg.data) {
      const { dependencies, devDependencies } = pkg.data
      const deps = Object.keys({ ...dependencies, ...devDependencies })
      this.config = ['vue', 'react'].reduce((p, k) => {
        if (!p.hasOwnProperty(k)) {
          p[k] = deps.some(k => new RegExp(`\b${k}\b`).test(k))
        }
        return p
      }, config)
    }

    this.pkg = pkg
  }

  _checkExternal (id: string, input: InputOptions) {
    const dependencies = input.dependencies || this.config.dependencies || []
    if (!isArray(dependencies)) {
      return !!dependencies[id]
    }
    return dependencies.length ? ~dependencies.indexOf(id) : false
  }

  /**
   * Normalize bundler config for rollup engine input, output configs.
   */
  _normalizeEntry (entry: BundlerEntry): Array<{ i: InputOptions; o: OutputOptions; }> {
    const destDir = this.config.destDir
    const {
      targets, // `targets` be deprecated, use output instead
      output,
      globals = {},
      ...baseInput
    } = entry

    let chunks = output || targets
    if (!chunks) {
      throw new Error('`output` mandatory required')
    }

    if (!isArray(chunks)) {
      chunks = [chunks]
    }

    return chunks.map(chunk => {
      const { format } = chunk
      if (!format) {
        throw new Error('target output format required.')
      }

      const input = { ...baseInput }

      // extract some extends option properties
      const {
        compress,
        ...output
      } = chunk

      // merge with builtin and common options
      Object.assign(output, {
        globals,
        indent: '  ',
      })

      // resolve output file with base dir
      if (output.file) {
        output.file = resolve(destDir, output.file)
      }

      const options: RollupContextOptions = omit(this.config, 'entry')

      const bundleCtx: RollupContext = {
        ...input,
        output,
        options
      }

      // provides some default plugins if list is empty
      const plugins = mergeArray(
        defaultTo(input.plugins, zeroConfigPlugins, isEmpty),
        builtinPlugins,
        { pk: 'name' })

      input.plugins = plugins
        .map(p => createPlugin(p, bundleCtx))
        .filter(Boolean)

      output.plugins = (output.plugins || [])

      // default to compress (except as configure this option explicitly)
      let enableCompress = options.compress !== false

      const { file } = output
      if (file) {
        // enable minimize by the default
        if (compress !== undefined) {
          enableCompress = !!compress
        } else {
          // enable minimize when out file suffixed `*.min.*` pattern
          enableCompress = options.compress == null
            ? /\.min\./.test(basename(file))
            : enableCompress
        }
      }

      if (enableCompress) {
        // Add compress based on terser, with build signature
        output.plugins.push('minify')
      }

      // reduce output plugins exists in input
      output.plugins = output.plugins
        .reduce((arr, p) => {
          const name = typeof p === 'string' ? p : p.name
          if (!find(plugins, (o) => o === p || name && (o === name || o.name === name))) {
            arr.push(p)
          }
          return arr
        }, [])
        .map(p => createPlugin(p, bundleCtx))
        .filter(Boolean)

      // external(importee, importer);
      const defaultExternalFn = (id: string, checkDependency: boolean) => {
        if (id === 'babel-plugin-transform-async-to-promises/helpers') {
          return false
        }

        const isDependency = this._checkExternal(id, input)
        checkDependency = typeof checkDependency === 'boolean' ? checkDependency : false
        if (checkDependency) {
          // Check cjs and esm with external bundles by the defaults
          return isDependency
        }

        return !/umd|iife/.test(format) && isDependency
      }

      const _external = input.external // fn(id, format, defaultFn)
      const external = !_external
        ? defaultExternalFn
        : (isFunction(_external)
          ? id => _external(id, format, defaultExternalFn) : _external)

      return {
        i: {
          ...input,
          external
        },
        o: {
          ...output
        }
      }
    })
  }

  run (entry: BundlerEntry) {
    const list = this._normalizeEntry(entry)
    const files = list.map(({ o }) => relativeId(o.file || o.dir))

    debug('entries (normalized) => \n%O', list)

    stderr(chalk.cyan(`build ${chalk.bold(relativeId(entry.input))} \u2192 ${chalk.bold(files.join(', '))} ...`))

    return sequence(list, async ({ i, o }): Promise<RollupBuild> => {
      const start = Date.now()
      const bundle: RollupBuild = await rollup.rollup(i)
      const out: RollupOutput = await bundle.write(o)

      stderr(chalk.green(`created ${chalk.bold(relativeId(o.file || o.dir))} (${prettyBytes(out.output.filter(o => o.code).reduce((n, o) => n + o.code.length, 0))}) in ${chalk.bold(prettyMs(Date.now() - start))}`))
      return bundle
    })
  }

  async build () {
    await this._init()
    return sequence(this.config.entry, o => this.run(o))
  }

  async watch (options?: any) {
    const watchOptions = []
    const watch = { chokidar: true, ...options }
    await this._init()
    this.config.entry.forEach(entry => {
      const list = this._normalizeEntry(entry)
      list.forEach(({ i, o }) => {
        watchOptions.push({ watch, ...i, output: o })
      })
    })
    return rollup.watch(watchOptions)
  }
}
