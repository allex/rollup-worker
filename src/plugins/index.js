// Re-exports some builtin plugins

import { pluginImpls, defaultPluginOpts } from './defaults'

export { defaultPluginOpts }

const debug = require('debug')('rollup-worker:plugins')

export default {
  // api for get default plugins
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
      debug(`construct plugin "${name}" =>`, args[0])
      return fn.apply(null, args)
    }
  }
}
