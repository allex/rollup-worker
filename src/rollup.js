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

const assign = Object.assign

function read (path) { // eslint-disable-line no-unused-vars
  return fs.readFileSync(path, 'utf8')
}

function write (dest, code) {
  return new Promise(function (resolve, reject) {
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
   *      targets: [
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
  constructor (config) {
    if (!config) {
      throw new Error('Illegal constructor arguments.')
    }
    this.config = assign({
      plugins: {} // settings for default plugins
    }, config)
  }

  _checkExternal (id, entry) {
    const dependencies = entry.dependencies || this.config.dependencies || []
    if (!Array.isArray(dependencies)) {
      return !!dependencies[id]
    }
    return dependencies.length ? ~dependencies.indexOf(id) : false
  }

  _normalizePlugins (plugins, rollupCfg) {
    return (plugins || [ 'babel', 'resolve', 'commonjs' ])
      .map(p => {
        if (typeof p === 'string') {
          let defaults = this.config.plugins[p], f
          if (!(f = defaultPlugins[p])) {
            throw new Error(`The built-in plugin invalid. [${p}]`)
          }
          return f(defaults, rollupCfg)
        }
        return p
      })
      .filter(p => !!p)
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
    let { targets, globals } = entry; delete entry.targets

    globals = globals || {}

    return targets.map(output => {
      const { format } = output
      if (!format) {
        throw new Error('target output format required.')
      }

      output = assign({ globals }, output); delete output.plugins

      const input = assign({
        external (id) {
          return !/umd|iife/.test(format) && self._checkExternal(id, entry)
        },
        plugins: [
          ...this._normalizePlugins(output.plugins || entry.plugins, { ...entry, output })
        ]
      }, entry)

      return { input, output }
    })
  }

  mapBundles (entry) {
    const destDir = this.config.destDir
    const list = this._normalizeEntry(entry)

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
    const { destDir, entry } = this.config
    mkdirp.sync(destDir)
    return Promise.all(
      entry.map(o => this.mapBundles(o))
    )
  }
}

module.exports = Rollup
