/**
 * Rollup worker for bundle multiple entry
 *
 * MIT Licensed
 *
 * Authors:
 *   Allex Wang <allex.wxn@gmail.com> (http://iallex.com/)
 */

'use strict'

const fs = require('fs')
const path = require('path')
const os = require('os')
const rollup = require('rollup')
const uglify = require('uglify-js')
const commonjs = require('rollup-plugin-commonjs')
const node = require('rollup-plugin-node-resolve')
const mkdirp = require('mkdirp')

function read (path) {
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

const defaultPlugins = () => [
  node({ jsnext: true, browser: true, module: true, main: true })
  , commonjs()
]

const uglifyjs = (code, options = {}) => {
  return uglify.minify(code, Object.assign({
    output: {
      comments: function (n, c) {
        /*
        IMPORTANT: Please preserve 3rd-party library license info,
        inspired from @allex/amd-build-worker/config/util.js
        */
        var text = c.value, type = c.type;
        if (type == 'comment2') {
          return /^!|@preserve|@license|@cc_on|MIT/i.test(text)
        }
      }
    }
  }, options))
}

class Rollup {

  constructor(config) {
    if (!config) {
      throw new Error('Illegal constructor arguments.')
    }
    this.config = config
  }

  /**
   * Normalize config for rollup engine input, output configs.
   *
   * {
   *  input: 'path/foo.js',
   *  targets: [
   *    { [ outputConfig ... ] }, ...
   *  ]
   * }
   */
  _normalizeEntry(entry) {
    return {
      input: {
        input: entry.input,
        plugins: [
          ...(entry.plugins || []), ...defaultPlugins()
        ]
      },
      targets: entry.targets.map(v => v)
    }
  }

  build() {
    const { destDir, entry } = this.config

    mkdirp.sync(destDir)

    const tasks = entry.map(async (task) => {
      const { input, targets } = this._normalizeEntry(task)

      // create a bundle
      let bundle = await rollup.rollup(input)

      return Promise.all(targets.map(async (output) => {
        let { file: dest, minimize } = output

        if (dest) {
          dest = path.resolve(destDir, dest)
          output.file = dest
          if (/\.min\./.test(path.basename(dest))) {
            minimize = true
          }
        }

        // generate code and a sourcemap
        const { code, map } = await bundle.generate(output)

        if (!minimize) {
          // write bundle result first
          await write(dest, code, bundle)
        }

        if (['es', 'cjs'].includes(output.format)) {
          minimize = minimize || { ext: '.min' }
        }

        if (minimize) {
          let minify = uglifyjs(code)
          let ext = minimize.ext

          // generate a extra minimize file (*.min.js)
          if (ext) {
            ext = ext.charAt(0) === '.' ? ext : `.${ext}`
            dest = path.join(path.dirname(dest), `${path.basename(dest, '.js')}${ext}.js`)
          }

          let s = minify.code, banner = output.banner
          if (banner && s.substring(0, banner.length) !== banner) {
            s = output.banner + s
          }

          // write minify
          await write(dest, s, bundle)
        }

        return bundle
      }))

    })

    return Promise.all(tasks)
  }
}

module.exports = Rollup
