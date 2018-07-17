/**
 * Provide some built-in plugins for Rollup worker
 *
 * MIT Licensed
 *
 * Authors:
 *   Allex Wang <allex.wxn@gmail.com> (http://iallex.com/)
 */

import path from 'path'
import { deepAssign } from './utils'
import { babel, commonjs, resolve, json } from './plugins'

const debug = require('debug')('rollup-worker:plugins')
const assign = deepAssign

const defaultPlugins = {
  resolve (defaults) {
    const opts = assign({
      jsnext: true,
      module: true,
      main: true,
      browser: true,

      // For more resolve options see <https://www.npmjs.com/package/resolve>
      customResolveOptions: {
        moduleDirectory: [ 'src', 'node_modules' ],
        pathFilter (pkg, resvPath, relativePath) {
          const replacements = pkg.browser
          if (!replacements) {
            return
          }
          if (relativePath[0] !== '.') {
            relativePath = './' + relativePath
          }
          let mappedPath = replacements[relativePath]
          if (!mappedPath && !path.extname(relativePath)) {
            mappedPath = replacements[relativePath + '.js']
            if (!mappedPath) {
              mappedPath = replacements[relativePath + '.json']
            }
          }
          return mappedPath
        }
      }
    }, defaults)

    debug('`resolve` options => ', opts)

    return resolve(opts)
  },

  json (defaults) {
    const opts = { indent: '  ', ...defaults }
    return json(opts)
  },

  babel,

  commonjs
}

export default defaultPlugins
