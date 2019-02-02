// Re-exports some builtin plugins

import { defaultPluginOpts, pluginImpls } from './defaults'

const debug = require('debug')('rollup-worker:plugins')

export { defaultPluginOpts }

// api for get default plugins
export const getPlugin = (name) => {
  const fn = pluginImpls[name]
  if (typeof fn !== 'function') {
    throw new Error(`Get plugin by name failed, name="${name}"`)
  }
  return (opt) => {
    const optFn = defaultPluginOpts[name]
    if (optFn) {
      // merge plugin default options
      opt = optFn(opt)
    }
    debug(`construct plugin "${name}" =>`, opt)
    return fn.apply(null, [opt])
  }
}
