import { get, hasOwn, isArray, isFunction, isString, merge } from '@fdio/utils'
import { Plugin, PluginImpl } from 'rollup'

import { loadModule, result } from '../utils'
import { normalizeWithDefaultOptions } from './options'

import customBabel from './babel-custom'

export type PluginStruct = PluginImpl | Plugin
export type PluginConfig = string | PluginStruct | [string, PluginStruct]

interface PluginDefine {
  name?: string;
  impl: () => PluginImpl;
}

const plugins: Kv<PluginDefine> = {
  babel: {
    impl: () => customBabel()
  },
  globals: {
    impl: () => loadModule('@allex/rollup-plugin-node-globals')
  },
  minify: {
    impl: () => loadModule('rollup-plugin-jspacker')
  },
  resolve: {
    impl: () => loadModule('@rollup/plugin-node-resolve').nodeResolve
  },
  json: {
    impl: () => loadModule('rollup-plugin-json5')
  },
  typescript: {
    impl: () => loadModule('@rollup/plugin-typescript')
  }
}

const isRollupPluginDefine = o =>
  typeof o === 'function' && !(['resolveId', 'transform', 'load', 'renderChunk'].some(k => !!o[k]))

const importPlugin = (name: string): PluginImpl | null => {
  let p: PluginImpl
  const tryNames: string[] = /\bplugin-/.test(name)
    ? [name]
    : [`rollup-plugin-${name}`, `@rollup/plugin-${name}`]

  for (let i = -1, l = tryNames.length, n; ++i < l;) {
    n = tryNames[i]
    try {
      p = loadModule(n)
      break
    } catch (e) {
      if (i === l) { throw e }
    }
  }

  return p
}

export const loadPlugin = <T> (name: string): T | null => {
  const plugin = hasOwn(plugins, name)
    ? plugins[name]!.impl()
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

export const getPluginCfg = (name: string, ctx?: RollupContext): PluginOptions => {
  // #1 evaluate project localize settings
  let cfg = result(get(ctx, `options.plugins.${name}`, {}), ctx)

  // #2 mixin builtin options if a builtin plugin
  cfg = normalizeWithDefaultOptions(name, cfg, ctx)

  // #3 mixin output localize overrides
  const override = get(ctx, `output.plugins.${name}`)
  if (override) {
    merge(cfg, override)
  }

  return cfg
}

/**
 * Get plugin constructor by name
 */
export const getPluginCtor = (p: PluginConfig, cfg?: Partial<PluginOptions>): PluginStruct => {
  p = (
    isString(p)
      ? loadPlugin<PluginImpl>(p as string)
      : p
  ) as PluginStruct
  if (cfg && isRollupPluginDefine(p)) {
    return (options: PluginOptions): Plugin => (p as PluginImpl)(merge({}, cfg, options))
  }

  return p
}

/**
 * Construct plugin by name (with rollup options)
 */
export const buildPlugin = (p: PluginConfig, ctx?: RollupContext): Plugin => {
  let name: string = ''
  if (isString(p)) {
    name = p as string
    p = null
  } else if (isArray(p)) {
    [ name, p ] = p // [ name, constructor ]
  }

  const cfg: PluginOptions | null = isString(name)
    ? getPluginCfg(name, ctx)
    : null
  const plugin = getPluginCtor(p || name, cfg)

  // ensure returns plugin instance
  return result(plugin, {})
}
