/**
 * Rollup worker for bundle multiple entry
 *
 * MIT Licensed
 *
 * Authors:
 *   Allex Wang <allex.wxn@gmail.com> (http://iallex.com/)
 */

import chalk from 'chalk'
import fs from 'fs'
import os from 'os'
import mkdirp from 'mkdirp'
import path from 'path'
import Debug from 'debug'
import prettyBytes from 'pretty-bytes'
import prettyMs from 'pretty-ms'
import rollup from 'rollup'
import uglify from 'terser'
import loadConfigFile from './loadConfigFile'
import { stderr } from './logging'
import { defaultPluginOpts, getPlugin } from './plugins'
import { deepAssign, isArray, isFunction, isString, mergeArray, relativeId, result, sequence } from './utils'
import { version } from '../package.json'
import { md5 } from '@allex/md5'

const debug = Debug('rollup-worker')

// some builtin plugins
const builtinPlugins = ['json', 'replace']

interface OutputMinify {
  code: string;
  map?: SourceMap;
  error?: Error
}

function write(file, code): Promise<any> {
  return new Promise((resolve, reject) => {
    mkdirp.sync(path.dirname(file))
    fs.writeFile(file, code, err => err ? reject(err) : resolve())
  })
}

const uglifyjs = (code, options = {}) => {
  // remove duplicates comments
  const commentsCache = {}

  // https://github.com/mishoo/UglifyJS2#minify-options
  return uglify.minify(code, deepAssign({
    ie8: true,
    output: {
      comments(n, c) {
        /*! IMPORTANT: Please preserve 3rd-party library license, Inspired from @allex/amd-build-worker/config/util.js */
        if (c.type === 'comment2') {
          let text = c.value
          let preserve = /^!|@preserve|@license|@cc_on|\blicensed\b/i.test(text) && !commentsCache[text]
          if (preserve) {
            commentsCache[text] = 1
            // strip blanks
            text = text.replace(/\n\s\s*/g, '\n ')
            if (preserve = !commentsCache[text]) {
              commentsCache[text] = 1
              c.value = text
              if (!~text.indexOf('\n')) {
                c.nlb = false
              }
            }
          }
          return preserve
        }
      }
    },
    compress: {
      drop_console: true,
      drop_debugger: true
    },
    module: true
  }, options))
}

const printError = stderr

const isRollupPluginCtor = o =>
  isFunction(o) && !(['resolveId', 'transform', 'load'].some(k => !!o[k]))

const isNativeRollupCfg = o => {
  if (!isArray(o)) o = [o]
  return o.some(o => !!(o.input && o.output))
}

const getCombinePlugins = (pi, po) => {
  if ((pi && pi.length) || (po && po.length)) {
    return mergeArray(pi, po, { pk: 'name' })
  }
  // Returns `null` to identify use builtin plugins when both pi, po not set.
  return null
}

export interface Kv<T = any> {
  [key: string]: T;
}

export interface PluginOption {
  [name: string]: any;
}

export interface BundleEntry {
  code: string;
}

export interface WorkerOptions {
  destDir: string;
  pluginOptions: KV<PluginOption>;
  entry: BundleEntry[];
}

class RollupWorker {
  private config: any

  /**
   * Multi-entry config for rollup bundle
   *
   * @constructor
   * @param {Object} config The config for multiple bundle
   */
  constructor(options: WorkerOptions) {
    if (!options) {
      throw new Error('Illegal constructor arguments.')
    }

    // Adapter options is a native rollup configs
    if (isNativeRollupCfg(options)) {
      options = {
        entry: isArray(options) ? options : [options]
      }
    }

    const entry = options.entry
    if (!entry) {
      throw new Error('entry not valid')
    }

    options.entry = isArray(entry) ? entry : [entry]

    this.config = {
      plugins: {}, // settings for default plugins
      ...options
    }
  }

  getPluginCfg(name: string, ...args: any[]) {
    const cfg = this.config
    let opt = (cfg.pluginOptions || cfg.plugins || 0)[name]

    // project local plugin options
    if (opt) {
      opt = result(opt, ...args)
    }

    // defaults
    const f = defaultPluginOpts[name]
    if (f) {
      opt = f(opt)
    }

    return opt
  }

  _checkExternal(id, entry) {
    const dependencies = entry.dependencies || this.config.dependencies || []
    if (!isArray(dependencies)) {
      return !!dependencies[id]
    }
    return dependencies.length ? ~dependencies.indexOf(id) : false
  }

  _normalizePlugins(plugins, rollupCfg) {
    if (!plugins) {
      // default plugins
      plugins = ['babel', 'resolve', 'commonjs']
    } else {
      plugins = plugins.filter(p => !!p)
    }

    // combin builtin plugins
    plugins = mergeArray(builtinPlugins, plugins, { pk: 'name' })

    const output = rollupCfg.output

    return plugins.map(p => {
      let name
      if (isString(p)) {
        name = p
        p = null
      }

      // [ name, constructor ]
      if (isArray(p)) {
        name = p[0]
        p = p[1]
      }

      if (!p && name) {
        p = getPlugin(name)
      }

      // apply plugin settings if a plugin constructor
      if (isRollupPluginCtor(p)) {
        let settings
        name = name || p.$name || p.name
        if (name) {
          settings = this.getPluginCfg(name, rollupCfg)
          const out = relativeId(output.file)
          debug(`plugin settings of "${name}" for "${out}" =>`, settings || 'nil')
        } else {
          debug(`anonymous plugin without any settings.`, p)
        }
        p = p(settings)
      }

      return p
    })
  }

  /**
   * Normalize config for rollup engine input, output configs.
   *
   * ```
   * {
   *  input: { input: 'path/foo.js', ...  },
   *  output: [
   *    { [ outputConfig ... ] },
   *    ...
   *  ]
   * }
   * ```
   */
  _normalizeEntry(entry) {
    entry = { ...entry }

    const destDir = this.config.destDir || '.'

    let { targets, output, globals } = entry

    ; ['targets', 'output', 'globals'].forEach(k => delete entry[k])

    let list = output || targets
    globals = globals || {}

    if (!list) {
      throw new Error('You must specify `option.output`.')
    }

    if (!isArray(list)) {
      list = [list]
    }

    return list.map(o => {
      const { format } = o
      if (!format) {
        throw new Error('target output format required.')
      }

      // merge with some defaults
      const output = { globals, indent: '  ', ...o }
      let input = { ...entry }

      // resolve output file with base dir
      if (output.file) {
        output.file = path.resolve(destDir, output.file)
      }

      const plugins = this._normalizePlugins(
        getCombinePlugins(input.plugins, output.plugins), { ...input, output })

      delete input.plugins
      delete output.plugins

      // external(importee, importer);
      const defaultExternalFn = (id, checkDependency) => {
        const isDependency = this._checkExternal(id, input)

        checkDependency = typeof checkDependency === 'boolean'
          ? checkDependency : false

        if (checkDependency) {
          // Check cjs and esm with external bundles by the defaults
          return isDependency
        }

        return !/umd|iife/.test(format) && isDependency
      }

      const _external = input.external; delete input.external // fn(id, format, defaultFn)

      const external = !_external
        ? defaultExternalFn
        : (isFunction(_external)
          ? id => _external(id, format, defaultExternalFn) : _external)

      input = { plugins, external, ...input }

      return { i: input, o: output }
    })
  }

  mapBundles(entry) {
    const list = this._normalizeEntry(entry)

    debug('normalized rollup entries => \n%O', list)

    const files = list.map(({ o }) => relativeId(o.file || o.dir))
    let start = Date.now()

    stderr(chalk.cyan(`build ${chalk.bold(relativeId(entry.input))} \u2192 ${chalk.bold(files.join(', '))} ...`))

    return sequence(list, async ({ i, o }): Promise<RollupBuild> => {

      // create a bundle
      const bundle: RollupBuild = await rollup.rollup(i)
      let { file, minimize } = o

      if (file && /\.min\./.test(path.basename(file))) {
        minimize = true
      }

      // generate code and a sourcemap
      let { output: [{ code }] }: RollupOutput = await bundle.generate(o) // eslint-disable-line no-unused-vars

      if (!minimize) {
        // write bundle result first
        await bundle.write(o)
        stderr(chalk.green(`created ${chalk.bold(relativeId(o.file))} (${prettyBytes(code.length)}) in ${chalk.bold(prettyMs(Date.now() - start))}`))
      }

      // Add minimize if not disabled explicitly.
      if (minimize !== false && !['es', 'cjs'].includes(o.format)) {
        minimize = minimize || { ext: '.min' }
      }

      if (minimize) {
        start = Date.now()
        const minified: OutputMinify = uglifyjs({ [file]: code }, this.getPluginCfg('uglifyjs'))

        const ex = minified.error
        if (ex) {
          if (ex.name === 'SyntaxError') {
            printError(`Parse error at ${ex.filename}:${ex.line},${ex.col}`)
            const lines = code.split(/\r?\n/)
            let col = ex.col
            let line = lines[ex.line - 1]
            if (!line && !col) {
              line = lines[ex.line - 2]
              col = line.length
            }
            if (line) {
              const limit = 70
              if (col > limit) {
                line = line.slice(col - limit)
                col = limit
              }
              printError(line.slice(0, 80))
              printError(line.slice(0, col).replace(/\S/g, ' ') + '^')
            }
          }
          throw ex
        }

        code = minified.code

        // generate a extra minimize file (*.min.js)
        let ext = minimize.ext
        if (ext) {
          ext = ext.charAt(0) === '.' ? ext : `.${ext}`
          file = path.join(path.dirname(file), `${path.basename(file, '.js')}${ext}.js`)
        }

        let banner = (o.banner || '').trim()
        if (banner && code.substring(0, banner.length) !== banner) {
          banner = banner.replace(/\r\n?|[\n\u2028\u2029]|\s*$/g, '\n')
          code = banner + code
        }

        const footer = (o.footer || `/* [hash] */`).replace(/\[hash\]/g, md5(code))
        code = code + os.EOL + footer

        // write minify
        await write(file, code, start)
        stderr(chalk.green(`created ${chalk.bold(relativeId(file))} (${prettyBytes(code.length)}) in ${chalk.bold(prettyMs(Date.now() - start))}`))
      }

      return bundle
    })
  }

  build() {
    return sequence(this.config.entry, o => this.mapBundles(o))
  }

  watch(options) {
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

export {
  version,
  RollupWorker,
  getPlugin,
  loadConfigFile
}
