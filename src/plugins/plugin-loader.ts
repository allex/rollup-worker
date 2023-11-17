import {
  get, hasOwn, isArray, isFunction, isString, merge,
} from '@fdio/utils'
import { Plugin, PluginImpl } from 'rollup'

import { loadModule, result } from '../utils'
import {
  GenericPluginOptions, PluginContext, PluginName, PluginWithOptions,
} from '../types'

import { builtinPlugins } from './builtin-plugins'
import { getMergedOptions } from './default-options'

type PluginDefinition = PluginImpl | Plugin
type PluginSpec = PluginName | PluginDefinition | PluginWithOptions

const isRollupPluginCtor = (o: any): o is PluginImpl =>
  typeof o === 'function' && !(['resolveId', 'transform', 'load', 'renderChunk'].some(k =>
    !!o[k]))

/**
 * Load rollup plugin implemention, aka plugin constructor
 *
 * @param name plugin name
 * @returns PluginImpl
 */
const importPlugin = (name: string): PluginImpl | null => {
  let p: PluginImpl
  const tryNames: string[] = /\bplugin-/.test(name)
    ? [name]
    : [`rollup-plugin-${name}`, `@rollup/plugin-${name}`]

  for (let i = -1, l = tryNames.length; ++i < l;) {
    const n = tryNames[i]
    try {
      p = loadModule(n)
      break
    } catch (e) {
      if (i === l) {
        throw new Error(`Cannot load plugin "${name}": ${e.message}.`)
      }
    }
  }

  return p
}

const loadPlugin = (name: string): PluginDefinition | null => {
  const plugin = hasOwn(builtinPlugins, name)
    ? builtinPlugins[name]!.impl()
    : importPlugin(name)

  if (!plugin) {
    throw new Error(`Cannot find plugin module '${name}`)
  }

  // hack some plugin with named exports, { [pluginName]: () => {} }
  if (!isFunction(plugin) && isFunction(plugin[name])) {
    return plugin[name]
  }

  return plugin
}

const getPluginOptions = (name: string, ctx?: PluginContext) => {
  // #1 evaluate project localize settings
  let opts = result(get(ctx, `options.plugins.${name}`, {}), ctx)

  // #2 mixin builtin options if a builtin plugin
  opts = getMergedOptions(name, opts, ctx)

  // #3 mixin output localize overrides
  const override = get(ctx, `output.plugins.${name}`)
  if (override) {
    merge(opts, override)
  }

  return opts
}

/**
 * Get plugin constructor by name
 */
export const getPluginCtor = (spec: PluginSpec, defaultOptions?: Record<string, unknown>): PluginDefinition => {
  let p: string | Plugin | PluginImpl

  // plugin with default options
  if (isArray(spec)) {
    p = spec[0]
    defaultOptions = defaultOptions ?? spec[1]
  } else {
    p = spec
  }

  const ctor = isString(p) ? loadPlugin(p) : p
  if (defaultOptions && isRollupPluginCtor(ctor)) {
    return (options): Plugin =>
      ctor(merge({}, defaultOptions, options))
  }

  return ctor
}

/**
 * Construct plugin by name
 */
export const initPlugin = (p: PluginSpec, ctx?: PluginContext): Plugin => {
  let name: string = ''
  let pluginOptions: GenericPluginOptions = {}

  if (isArray(p)) { // PluginWithOptions
    [p, pluginOptions] = p
  }

  if (isString(p)) {
    name = p
    p = null
  }

  if (isString(name)) {
    pluginOptions = merge({}, pluginOptions, getPluginOptions(name, ctx))
  }

  return result(getPluginCtor(p || name, pluginOptions), {})
}
