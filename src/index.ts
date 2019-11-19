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
import fs from 'fs'
import path from 'path'
import prettyBytes from 'pretty-bytes'
import prettyMs from 'pretty-ms'
import rollup from 'rollup'

import {
  defaultTo, find, get, isArray, isEmpty, isFunction, isString, merge, omit, sequence
} from '@fdio/utils'

import { mergeArray, relativeId } from './utils'
import { stderr } from './utils/logging'

import { createPlugin } from './plugins'

export { version } from '../package.json'
export { loadConfigFile } from './loadConfigFile'

const debug = Debug('rollup-worker')

// default plugins (for zero config)
const zeroConfigPlugins = ['babel', 'resolve', 'commonjs']

// some builtin plugins
const builtinPlugins = ['json', 'replace']

interface MinifyOutput {
  code: string;
  map?: SourceMap;
  error?: Error
}

const isNativeRollupConfig = o => (isArray(o) ? o : [o]).some(o => !!(o.input && o.output))

export interface Kv<T = any> {
  [key: string]: T;
}

export interface BundleEntry {
  input: any;
  output: any;
  globals: Kv;
  external: (id: string, format: string, defaultFn: any) => boolean | Kv<string>;
}

export interface BundlerOptions {
  destDir: string;
  plugins: KV<{ [name: string]: any }>;
  entry: Array<Partial<BundleEntry>>;
  sourcemap: boolean;
}

export interface RollupContext {
  input: string;
  plugins: any[];
  output: any;
  options: Omit<BundlerOptions, 'entry'>;
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
      options = {
        entry: isArray(options) ? options : [options]
      }
    }

    const entry = options.entry
    if (!entry) {
      throw new Error('`entry` not valid')
    }

    options.entry = isArray(entry) ? entry : [entry]

    const config = this.config = {
      plugins: {}, // settings for default plugins
      ...options
    }

    if (config.pluginOptions) {
      stderr('rb config `pluginOptions` deprecated, use `plugins` instead')
      if (isEmpty(config.plugins)) {
        config.plugins = config.pluginOptions
      }
    }
  }

  _checkExternal (id: string, entry: EntryOptions) {
    const dependencies = entry.dependencies || this.config.dependencies || []
    if (!isArray(dependencies)) {
      return !!dependencies[id]
    }
    return dependencies.length ? ~dependencies.indexOf(id) : false
  }

  /**
   * Normalize bundler config for rollup engine input, output configs.
   *
   * ```
   * [
   *   {
   *    i: { input: 'path/foo.js', ...  },
   *    o: [
   *      { [ outputConfig ... ] },
   *      ...
   *    ]
   *   }
   * ]
   * ```
   */
  _normalizeEntry (entry): Array<{ i: InputConfig; o: OutputConfig; }> {
    entry = { ...entry } // shallow copy

    const destDir = this.config.destDir || '.'
    let { targets, output, globals } = entry // `targets` should be deprecated
    let chunks = output || targets

    if (!chunks) {
      throw new Error('`output` mandatory required')
    }

    globals = globals || {}

    delete entry.targets
    delete entry.output
    delete entry.globals

    if (!isArray(chunks)) {
      chunks = [chunks]
    }

    return chunks.map(chunk => {
      const { format } = chunk
      if (!format) {
        throw new Error('target output format required.')
      }

      const input = { ...entry }

      // merge with builtin and common options
      const output = {
        globals,
        indent: '  ',
        ...chunk
      }

      // resolve output file with base dir
      if (output.file) {
        output.file = path.resolve(destDir, output.file)
      }

      const bundleCtx: RollupContext = {
        ...input,
        output,
        options: omit(this.config, 'entry')
      }

      // provides some default plugins if list is empty
      const plugins = mergeArray(defaultTo(input.plugins, zeroConfigPlugins, isEmpty), builtinPlugins, { pk: 'name' })

      input.plugins = plugins
        .map(p => createPlugin(p, bundleCtx))
        .filter(Boolean)

      output.plugins = (output.plugins || [])

      // compress output if filename with `*.min.*` pattern
      let { file, minimize } = output
      if (minimize !== false && /\.min\./.test(path.basename(file))) {
        minimize = true
      }

      if (minimize) {
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

  run (entry) {
    const list = this._normalizeEntry(entry)
    const files = list.map(({ o }) => relativeId(o.file || o.dir))

    debug('normalized rollup entries => \n%O', list)

    stderr(chalk.cyan(`build ${chalk.bold(relativeId(entry.input))} \u2192 ${chalk.bold(files.join(', '))} ...`))

    return sequence(list, async ({ i, o }): Promise<RollupBuild> => {
      const start = Date.now()
      const bundle: RollupBuild = await rollup.rollup(i)
      const out = await bundle.write(o)

      stderr(chalk.green(`created ${chalk.bold(relativeId(o.file))} (${prettyBytes(out.output.filter(o => o.code).reduce((n, o) => n + o.code.length, 0))}) in ${chalk.bold(prettyMs(Date.now() - start))}`))
      return bundle
    })
  }

  build () {
    return sequence(this.config.entry, o => this.run(o))
  }

  watch (options) {
    const watchOptions = []
    const watch = { chokidar: true, ...options }
    this.config.entry.forEach(entry => {
      const list = this._normalizeEntry(entry)
      list.forEach(({ i, o }) => {
        watchOptions.push({ watch, ...i, output: o })
      })
    })
    return rollup.watch(watchOptions)
  }
}
