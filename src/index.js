/**
 * Rollup worker for bundle multiple entry
 *
 * MIT Licensed
 *
 * Authors:
 *   Allex Wang <allex.wxn@gmail.com> (http://iallex.com/)
 */

'use strict'

import fs from 'fs'
import path from 'path'
import rollup from 'rollup'
import uglify from 'uglify-js'
import mkdirp from 'mkdirp'
import prettyBytes from 'pretty-bytes'
import prettyMs from 'pretty-ms'
import chalk from 'chalk'
import loadConfigFile from './loadConfigFile'
import { stderr } from './logging'
import { default as defaultPlugins, defaultPluginOpts } from './plugins'
import { result, sequence, deepAssign, relativeId, mergeArray } from './utils'

const pkg = require('../package.json')
const debug = require('debug')('rollup-worker')
const assign = Object.assign
const isArray = Array.isArray

const version = pkg.version

// some builtin plugins
const builtins = [ 'json', 'replace' ]

function read (path) { // eslint-disable-line no-unused-vars
  return fs.readFileSync(path, 'utf8')
}

function write (dest, code) {
  return new Promise((resolve, reject) => {
    mkdirp.sync(path.dirname(dest))
    fs.writeFile(dest, code, (err) => err ? reject(err) : resolve())
  })
}

const uglifyjs = (code, options = {}) => {
  const commentsCache = {}
  // https://github.com/mishoo/UglifyJS2#minify-options
  return uglify.minify(code, deepAssign({
    ie8: true,
    output: {
      comments (n, c) {
        /*! IMPORTANT: Please preserve 3rd-party library license, Inspired from @allex/amd-build-worker/config/util.js */
        var text = c.value, type = c.type
        if (type === 'comment2') {
          var preserve = /^!|@preserve|@license|@cc_on|\blicensed\b/i.test(text)
          // remove duplicates comments
          preserve = preserve && !commentsCache[text]
          if (preserve && !~text.indexOf('\n')) {
            c.nlb = false
          }
          if (preserve) {
            commentsCache[text] = 1
          }
          return preserve
        }
      }
    },
    compress: {
      drop_console: true,
      drop_debugger: true
    }
  }, options))
}

const isRollupPluginCtor = o =>
  typeof o === 'function' && !(['resolveId', 'transform', 'load'].some(k => !!o[k]))

const isNativeRollupCfg = o => {
  if (!isArray(o)) o = [ o ]
  return o.some(o => !!(o.input && o.output))
}

const getCombinePlugins = (pi, po) => {
  if ((pi && pi.length) || (po && po.length)) {
    return mergeArray(pi, po, { pk: 'name' })
  }
  // Returns `null` to identify use builtin plugins when both pi, po not set.
  return null
}

export class Rollup {
  /**
   * Multi-entry config for rollup bundle
   *
   * @constructor
   * @param {Object} config The config for multiple bundle
   *
   * ```
   * {
   *   destDir: path.join(__dirname, '..', './dist'),
   *   pluginOptions: {
   *    resolve: { ... },
   *    commonjs: { ... },
   *    babel: { ... }
   *   },
   *   entry: [
   *    {
   *      // more input options: https://rollupjs.org/guide/en#inputOptions
   *      input: 'src/index.js',
   *      plugins,
   *      globals,
   *      external,
   *      ...
   *      output: [
   *        {
   *          // more ouput options: https://rollupjs.org/guide/en#outputoptions
   *          globals, format, name, file, banner, ...
   *        },
   *        ...
   *      ]
   *    },
   *    ...
   *   ]
   * }
   * ```
   */
  constructor (options) {
    if (!options) {
      throw new Error('Illegal constructor arguments.')
    }

    // Adapter options is a native rollup configs
    if (isNativeRollupCfg(options)) {
      options = {
        entry: isArray(options) ? options : [ options ]
      }
    }

    const entry = options.entry
    if (!entry) {
      throw new Error('entry not valid')
    }

    options.entry = isArray(entry) ? entry : [ entry ]

    this.config = assign({
      plugins: {} // settings for default plugins
    }, options)
  }

  getopt (name, ...args) {
    const cfg = this.config
    let opt = (cfg.pluginOptions || cfg.plugins || 0)[name]

    // project local plugin options
    if (opt) {
      opt = result(opt, ...args)
    }

    // defaults
    let f = defaultPluginOpts[name]
    if (f) {
      opt = f(opt)
    }

    return opt
  }

  _checkExternal (id, entry) {
    const dependencies = entry.dependencies || this.config.dependencies || []
    if (!isArray(dependencies)) {
      return !!dependencies[id]
    }
    return dependencies.length ? ~dependencies.indexOf(id) : false
  }

  _normalizePlugins (plugins, rollupCfg) {
    if (!plugins) {
      // default plugins
      plugins = [ 'babel', 'resolve', 'commonjs' ]
    } else {
      plugins = plugins.filter(p => !!p)
    }

    // combin builtin plugins
    plugins = mergeArray(builtins, plugins, { pk: 'name' })

    const output = rollupCfg.output

    return plugins.map(p => {
      const byName = typeof p === 'string'
      let name = byName ? p : p.name

      if (byName) {
        name = p
        p = defaultPlugins.get(name)
      }

      // apply plugin settings if a plugin constructor
      if (isRollupPluginCtor(p)) {
        let settings
        if (name) {
          settings = this.getopt(name, rollupCfg)
          const out = relativeId(output.file)
          debug(`"plugin:${name}" for "${out}" =>`, settings || 'NULL')
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
   *  input: {
   *    input: 'path/foo.js',
   *    ...
   *  },
   *  output: [
   *    { [ outputConfig ... ] },
   *    ...
   *  ]
   * }
   * ```
   */
  _normalizeEntry (entry) {
    entry = assign({}, entry)

    let self = this
    let destDir = self.config.destDir || '.'

    let { targets, output, globals } = entry
    ;[ 'targets', 'output', 'globals' ].forEach(k => delete entry[k])

    output = output || targets
    globals = globals || {}

    if (!output) {
      throw new Error('You must specify `option.output`.')
    }

    if (!isArray(output)) {
      output = [ output ]
    }

    return output.map(o => {
      const { format } = o
      if (!format) {
        throw new Error('target output format required.')
      }

      // merge with some defaults
      let output = assign({ globals, indent: '  ' }, o)
      let input = assign({}, entry)

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
        const isDependency = self._checkExternal(id, input)

        checkDependency = typeof checkDependency === 'boolean'
          ? checkDependency : false

        if (checkDependency) {
          // Check cjs and esm with external bundles by the defaults
          return isDependency
        }

        return !/umd|iife/.test(format) && isDependency
      }

      let _external = input.external; delete input.external // fn(id, format, defaultFn)

      const external = !_external
        ? defaultExternalFn
        : (typeof _external === 'function'
          ? (id) => _external(id, format, defaultExternalFn) : _external)

      input = assign({ plugins, external }, input)

      return { input, output }
    })
  }

  mapBundles (entry) {
    const list = this._normalizeEntry(entry)

    debug('normalized rollup entries => \n%O', list)

    let start = Date.now()
    let files = list.map(({ input, output: t }) => relativeId(t.file || t.dir))

    stderr(chalk.cyan('build ' + chalk.bold(relativeId(entry.input)) + ' \u2192 ' + chalk.bold(files.join(', ')) + ' ...'))

    return sequence(list, async ({ input, output }) => {
      // create a bundle
      let bundle = await rollup.rollup(input)
      let { file: dest, minimize } = output

      if (dest && /\.min\./.test(path.basename(dest))) {
        minimize = true
      }

      // generate code and a sourcemap
      const { code: source, map } = await bundle.generate(output) // eslint-disable-line no-unused-vars

      if (!minimize) {
        // write bundle result first
        await bundle.write(output)
        stderr(chalk.green(`created ${chalk.bold(relativeId(output.file))} (${prettyBytes(source.length)}) in ${chalk.bold(prettyMs(Date.now() - start))}`))
      }

      // Add minimize if not disabled explicitly.
      if (minimize !== false && !['es', 'cjs'].includes(output.format)) {
        minimize = minimize || { ext: '.min' }
      }

      if (minimize) {
        let start = Date.now()
        let { code, error } = uglifyjs(source, this.getopt('uglifyjs'))
        if (error) {
          throw error
        }

        // generate a extra minimize file (*.min.js)
        let ext = minimize.ext
        if (ext) {
          ext = ext.charAt(0) === '.' ? ext : `.${ext}`
          dest = path.join(path.dirname(dest), `${path.basename(dest, '.js')}${ext}.js`)
        }

        let banner = (output.banner || '').trim()
        if (banner && code.substring(0, banner.length) !== banner) {
          banner = banner.replace(/\r\n?|[\n\u2028\u2029]|\s*$/g, '\n')
          code = banner + code
        }

        // write minify
        await write(dest, code, start)
        stderr(chalk.green(`created ${chalk.bold(relativeId(dest))} (${prettyBytes(code.length)}) in ${chalk.bold(prettyMs(Date.now() - start))}`))
      }

      return bundle
    })
  }

  build () {
    return sequence(this.config.entry, o => this.mapBundles(o))
  }

  watch (options) {
    const watchOptions = []
    const watch = assign({
      chokidar: true
    }, options)
    this.config.entry.forEach(entry => {
      const list = this._normalizeEntry(entry)
      list.forEach(({ input, output }) => {
        watchOptions.push({ ...input, output, watch })
      })
    })
    return rollup.watch(watchOptions)
  }
}

export {
  version,
  defaultPlugins,
  loadConfigFile
}
