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
import defaultPlugins from './defaultPlugins'
import loadConfigFile from './loadConfigFile'

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
      dest = path.relative(process.cwd(), dest)
      console.log(blue(dest) + ' ' + getSize(code))
      resolve()
    })
  })
}

function getSize (code) {
  return (code.length / 1024).toFixed(2) + 'kb'
}

function blue (str) {
  return '\x1b[1m\x1b[34m' + str + '\x1b[39m\x1b[22m'
}

const uglifyjs = (code, options = {}) => {
  return uglify.minify(code, assign({
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

const mergePlugins = (p1, p2) => {
  p1 = [].concat(p1 || [])
  if (p2) {
    const names = p1.map(o => o.name || o)
    p2.forEach(p => {
      if (!~names.indexOf(p)) {
        p1.push(p)
      }
    })
  }
  return p1
}

const isNativeRollupCfg = o => {
  if (!isArray(o)) o = [ o ]
  return o.some(o => !!(o.input && o.output))
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
   *   plugin: {
   *    resolve: { ... },
   *    commonjs: { ... },
   *    babel: { ... }
   *   },
   *   entry: [
   *    {
   *      // more input options: https://rollupjs.org/guide/en#inputOptions
   *      input: 'src/index.js',
   *      plugins,
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

    this.config = assign({
      plugins: {} // settings for default plugins
    }, options)
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
    const list = plugins.map(p => {
      if (typeof p === 'string') {
        let defaults = this.config.plugins[p], f
        if (!(f = defaultPlugins[p])) {
          throw new Error(`The built-in plugin invalid. [${p}]`)
        }
        p = f(defaults, rollupCfg)
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
    let { targets, output, globals } = entry; delete entry.targets

    output = output || targets
    globals = globals || {}

    if (!output) {
      throw new Error('You must specify `option.output`.')
    }

    if (!isArray(output)) {
      output = [ output ]
    }

    return output.map(output => {
      const { format } = output
      if (!format) {
        throw new Error('target output format required.')
      }

      let input = Object.assign({}, entry)

      let commonPlugins = input.plugins; delete input.plugins
      let extendPlugins = output.plugins; delete output.plugins

      output = assign({ globals }, output)

      const plugins =
        this._normalizePlugins(
          (commonPlugins || extendPlugins) ? mergePlugins(commonPlugins, extendPlugins) : null,
          { ...input, output })

      input = assign({
        plugins,
        external (id) {
          return !/umd|iife/.test(format) && self._checkExternal(id, input)
        }
      }, input)

      return { input, output }
    })
  }

  mapBundles (entry) {
    const destDir = this.config.destDir || '.'
    const list = this._normalizeEntry(entry)

    debug('rollup entry => \n%O', list)

    const series = list.map(async ({ input, output }) => {
      // create a bundle
      let bundle = await rollup.rollup(input)

      let { file: dest, minimize } = output

      // resolve destination file with `destDir`
      if (dest) {
        dest = path.resolve(destDir, dest)
        output.file = dest
        if (/\.min\./.test(path.basename(dest))) {
          minimize = true
        }
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
        let { code, error } = uglifyjs(source)
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

    return Promise.all(series)
  }

  build () {
    return Promise.all(
      this.config.entry.map(o => this.mapBundles(o))
    )
  }
}

Rollup.defaultPlugins = defaultPlugins
Rollup.loadConfigFile = loadConfigFile

export default Rollup
