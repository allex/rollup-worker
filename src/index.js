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
import chalk from 'chalk'
import defaultPlugins from './defaultPlugins'
import loadConfigFile from './loadConfigFile'
import { result, sequence, deepAssign, relativeId, mergeArray } from './utils'
import { stderr } from './logging'

const pkg = require('../package.json')
const debug = require('debug')('rollup-worker')
const assign = Object.assign
const isArray = Array.isArray

function read (path) { // eslint-disable-line no-unused-vars
  return fs.readFileSync(path, 'utf8')
}

function write (dest, code) {
  return new Promise(function (resolve, reject) {
    mkdirp.sync(path.dirname(dest))
    fs.writeFile(dest, code, function (err) {
      if (err) return reject(err)
      dest = relativeId(dest)
      stderr(chalk.cyan('\u2192 ' + chalk.bold(dest) + ' ' + getSize(code)))
      resolve()
    })
  })
}

const getSize = code => {
  let v = code.length / 1024
  let u = 'kb'
  if (v > 1024) {
    v = v / 1024
    u = 'Mb'
  }
  return v.toFixed(2) + u
}

const uglifyjs = (code, options = {}) => {
  // https://github.com/mishoo/UglifyJS2#minify-options
  return uglify.minify(code, deepAssign({
    ie8: true,
    output: {
      comments: function (n, c) {
        /*
        IMPORTANT: Please preserve 3rd-party library license info,
        inspired from @allex/amd-build-worker/config/util.js
        */
        var text = c.value, type = c.type
        if (type === 'comment2') {
          return /^!|@preserve|@license|@cc_on|MIT/i.test(text)
        }
      }
    }
  }, options))
}

const isRollupPluginCtor = o => typeof o === 'function' && ['resolveId', 'transform', 'load'].filter(k => !!o[k]).length === 0

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

class Rollup {
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
    const opt = (cfg.pluginOptions || cfg.plugins || {})[name]
    return result(opt, ...args)
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
      plugins = [ 'babel', 'resolve', 'commonjs' ]
    } else {
      plugins = plugins.filter(p => !!p)
    }

    // add some builtin plugins
    const builtins = [ 'json' ]
    plugins = mergeArray(plugins, builtins, { pk: 'name' })

    const output = rollupCfg.output

    const list = plugins.map(p => {
      const isBuiltin = typeof p === 'string'
      const name = isBuiltin ? p : p.name

      let defaults
      if (name) {
        defaults = this.getopt(name, rollupCfg)
        debug(`defaults of plugin "${name}" for "${output.format} => ${relativeId(output.file)}":`, defaults)
      }

      let pluginCtor = isRollupPluginCtor(p) ? p : null
      if (isBuiltin) {
        pluginCtor = defaultPlugins[p]
        if (!pluginCtor) {
          throw new Error(`The built-in plugin invalid. [${p}]`)
        }
      }

      // Apply plugin settings in runtime
      if (pluginCtor) {
        p = pluginCtor(defaults || {})
      }

      return p
    })

    return list
  }

  /**
   * Normalize config for rollup engine input, output configs.
   *
   * ```
   * {
   *  input: {
   *    input: 'path/foo.js',
   *    ...
   *  ],
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

      let output = assign({ globals }, o)
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
        await write(dest, source, bundle)
      }

      if (!['es', 'cjs'].includes(output.format)) {
        minimize = minimize || { ext: '.min' }
      }

      if (minimize) {
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

        let s = code, banner = output.banner
        if (banner && s.substring(0, banner.length) !== banner) {
          s = output.banner + s
        }

        // write minify
        await write(dest, s, bundle)
      }

      return bundle
    })
  }

  build () {
    return sequence(this.config.entry, o => {
      return this.mapBundles(o)
    })
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

Rollup.VERSION = pkg.version
Rollup.defaultPlugins = defaultPlugins
Rollup.loadConfigFile = loadConfigFile

export default Rollup
