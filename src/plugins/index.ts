import { get, hasOwn, isArray, isFunction, isString, memoize, merge } from '@fdio/utils'
import resolveFrom from 'resolve-from'
import { Plugin, PluginImpl } from 'rollup'

import { localRequire, relativeId, result } from '../utils'
import { defaultPluginOpts } from './options'

import customBabel from './babel-custom'

export type PluginStruct = PluginImpl | Plugin
export type PluginConfig = string | PluginStruct | [string, PluginStruct]

// defs builtin plugins alias
// For more builtin plugins see package.json#dependencies pattern with `rollup-plugin-xxx`
const pluginNameAliases = {
  globals: '@allex/rollup-plugin-node-globals',
  resolve: '@allex/rollup-plugin-node-resolve',
  json: 'rollup-plugin-json5',
  typescript: 'rollup-plugin-typescript2',
  minify: 'rollup-plugin-jspacker'
}

const builtinImpls = {
  babel: customBabel
}

const isRollupPluginCtor = o =>
  typeof o === 'function' && !(['resolveId', 'transform', 'load', 'renderChunk'].some(k => !!o[k]))

const pluginNameAliasesReverse = Object.keys(pluginNameAliases)
  .reduce((o, k) => (o[pluginNameAliases[k]] = k, o), {})

// builtin plugin for lazy required
const isBuiltIn = memoize((name: string): boolean => {
  name = pluginNameAliases[name] || name
  const deps = require('../package').dependencies
  return hasOwn(builtinImpls, name)
    || [name, `rollup-plugin-${name}`, `@rollup/plugin-${name}`].some(k => hasOwn(deps, k))
})

const importPlugin = (name: string, pkgName?: string): PluginImpl | null => {
  if (!pkgName && hasOwn(pluginNameAliases, name)) {
    pkgName = pluginNameAliases[name]
  }

  let p: PluginImpl
  const tryNames = pkgName ? [pkgName] : [`rollup-plugin-${name}`, `@rollup/plugin-${name}`]
  for (let i = -1, l = tryNames.length, n; ++i < l;) {
    n = tryNames[i]
    try {
      p = isBuiltIn(name)
        ? require(n)
        : localRequire(n)
      break
    } catch (e) {
      if (i === l) { throw e }
    }
  }

  // hack some plugin with named exports, eg: terser, minify
  if (!isFunction(p) && isFunction(p[name])) {
    return p[name]
  }

  return p
}

export const loadPlugin = <T> (name: string): T | null => {
  return hasOwn(builtinImpls, name)
    ? builtinImpls[name]
    : importPlugin(name)
}

const requireCache = require.cache
export const getPluginRefName = (p: PluginImpl): string => {
  const f = Object.keys(requireCache).find(k => requireCache[k].exports === p)
  if (f) {
    return [/(?:@[\w-]+)?\/rollup-plugin-([^/]+)/, /@rollup\/plugin-([^/]+)/].reduce((r, reg) => {
      if (r) return r
      const pkgName = reg.exec(f.substring(0, f.lastIndexOf('/'))) && RegExp.lastMatch
      // resolve aliased plugin name
      r = pluginNameAliasesReverse[pkgName] || RegExp.$1
      return r
    }, '')
  }
  return ''
}

export const getPluginCfg = (name: string, ctx?: RollupContext): PluginOptions | null => {
  if (!name) return null

  // #1 evaluate project localize settings
  let cfg = result(get(ctx, `options.plugins.${name}`, {}), ctx)

  // #2 mixin builtin options if a builtin plugin
  if (isBuiltIn(name)) {
    const f = defaultPluginOpts[name]
    if (f) {
      cfg = f(cfg, ctx)
    }
  }

  // #3 mixin output localize overrides
  const override = get(ctx, `output.${name}`)
  if (override) {
    merge(cfg, override)
  }

  return cfg
}

/**
 * Get plugin constructor by name
 */
export const getPluginCtor = (p: PluginConfig, cfg?: PluginOptions | null): PluginStruct => {
  p = (
    isString(p)
      ? loadPlugin<PluginImpl>(p)
      : p
  ) as PluginStruct
  if (cfg && isRollupPluginCtor(p)) {
    return (options: PluginOptions): Plugin => (p as PluginImpl)(merge({}, cfg, options))
  }
  return p
}

/**
 * Construct plugin by name (with rollup options)
 */
export const createPlugin = (p: PluginConfig, ctx?: RollupContext): Plugin => {
  let name: string = ''
  if (isString(p)) {
    name = p
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
