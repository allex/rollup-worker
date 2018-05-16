/**
 * Provide some built-in plugins for Rollup worker
 *
 * MIT Licensed
 *
 * Authors:
 *   Allex Wang <allex.wxn@gmail.com> (http://iallex.com/)
 */

import path from 'path'
import babel from 'rollup-plugin-babel'
import commonjs from 'rollup-plugin-commonjs'
import resolve from 'rollup-plugin-node-resolve'

const assign = Object.assign

const result = (o, ...args) => {
  return typeof o === 'function' ? o(...args) : o
}

const defaultPlugins = {
  resolve (defaults, rollupCfg) {
    return resolve(
      assign({}, result(defaults, rollupCfg), {

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
      }))
  },
  commonjs (defaults, rollupCfg) {
    return commonjs(
      assign({}, result(defaults, rollupCfg)))
  },
  babel (defaults, rollupCfg) {
    return babel(
      assign({}, result(defaults, rollupCfg)))
  }
}

export default defaultPlugins
