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

const defaultPluginOpts = {
  resolve (settings) {
    return deepAssign({
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
    }, settings)
  },

  json (settings) {
    return { indent: '  ', ...settings }
  },

  babel (settings) {
    return { ...settings }
  },

  commonjs (settings) {
    return {
      extensions: [ '.js', '.ts', '.coffee' ],
      ...settings
    }
  }
}

const pluginImpls = {
  resolve, json, babel, commonjs
}

export default {
  get (name) {
    const fn = pluginImpls[name]
    if (typeof fn !== 'function') {
      throw new Error(`Get plugin by name failed, name="${name}"`)
    }
    return (...args) => {
      const optFn = defaultPluginOpts[name]
      if (optFn) {
        // merge plugin default options
        args[0] = optFn(args[0])
      }
      debug(`construct plugin (name: "${name}") =>`, args[0])
      return fn.apply(null, args)
    }
  }
}
