import {
  get, hasOwn, isArray, isFunction, isString, merge,
} from '@fdio/utils'
import { Plugin, PluginImpl } from 'rollup'

import { loadModule, result } from '../utils'
import { PluginContext, PluginName } from '../types'

import { builtinPlugins } from './builtin-plugins'
import { getMergedOptions } from './default-options'

type PluginDefinition = PluginImpl | Plugin
type PluginSpec = PluginName | PluginDefinition | [string, PluginDefinition]

const isRollupPluginDefine = (o: any): o is PluginImpl =>
  typeof o === 'function' && !(['resolveId', 'transform', 'load', 'renderChunk'].some(k =>
    !!o[k]))

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
      if (i === l) { throw e }
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
export const getPluginCtor = (p: PluginSpec, cfg?: any): PluginDefinition => {
  const ctor = (
    isString(p)
      ? loadPlugin(p)
      : p
  ) as PluginDefinition
  if (cfg && isRollupPluginDefine(ctor)) {
    return (options): Plugin =>
      ctor(merge({}, cfg, options))
  }
  return ctor
}

/**
 * Construct plugin by name (with rollup options)
 */
export const initPlugin = (p: PluginSpec, ctx?: PluginContext): Plugin => {
  let name: string = ''
  if (isString(p)) {
    name = p as string
    p = null
  } else if (isArray(p)) {
    [name, p] = p // [ name, constructor ]
  }

  const cfg = isString(name) ? getPluginOptions(name, ctx) : null
  const plugin = getPluginCtor(p || name, cfg)

  // ensure returns plugin instance
  return result(plugin, {})
}
