import { get, hasOwn, isArray, isFunction, isString, memoize, merge } from '@fdio/utils'
import resolveFrom from 'resolve-from'
import { Plugin, PluginImpl } from 'rollup'

import { relativeId, result } from '../utils'
import { defaultPluginOpts } from './options'

type PluginStruct = PluginImpl | Plugin
type PluginConfig = string | PluginStruct | [string, PluginStruct]

// defs builtin plugins alias
// For more builtin plugins see package.json#dependencies pattern with `rollup-plugin-xxx`
const pluginNameAliases = {
  globals: '@allex/rollup-plugin-node-globals',
  resolve: '@allex/rollup-plugin-node-resolve',
  json: 'rollup-plugin-json5',
  typescript: 'rollup-plugin-typescript2',
  minify: 'rollup-plugin-jspacker'
}

const isRollupPluginCtor = o =>
  typeof o === 'function' && !(['resolveId', 'transform', 'load', 'renderChunk'].some(k => !!o[k]))

const localRequire = (
  name: string,
  { silent, cwd }: { silent?: boolean; cwd?: string } = {}
) => {
  cwd = cwd || process.cwd()
  const resolved = silent
    ? resolveFrom.silent(cwd, name)
    : resolveFrom(cwd, name)
  return resolved && require(resolved)
}

const pluginNameAliasesReverse = Object.keys(pluginNameAliases)
  .reduce((o, k) => (o[pluginNameAliases[k]] = k, o), {})

// builtin plugin for lazy required
const isBuiltIn = (name: string): boolean =>
  hasOwn(require('../package').dependencies, name)

const importPlugin = (mod: string, name: string) => {
  const p = isBuiltIn(mod)
    ? require(mod)
    : localRequire(mod)

  // hack some plugin with named exports, eg: terser, minify
  if (!isFunction(p) && isFunction(p[name])) {
    return p[name]
  }
  return p
}

export const loadPlugin = <T> (name: string): T | null => {
  if (hasOwn(pluginNameAliases, name)) {
    return importPlugin(pluginNameAliases[name], name)
  }

  const tryNames = [`rollup-plugin-${name}`, `@rollup/plugin-${name}`]
  for (let i = -1, l = tryNames.length, n; ++i < l;) {
    n = tryNames[i]
    try {
      return importPlugin(n, name)
    } catch (e) {
      if (i === l) { throw e }
    }
  }
  return null
}

const requireCache = require.cache
const getPluginRefName = memoize((p: PluginImpl): string => {
  const f = Object.keys(requireCache).find(k => requireCache[k].exports === p)
  if (f) {
    return [/(?:@[\w-]+)?\/rollup-plugin-([^/]+)/, /@rollup\/plugin-([^/]+)/].reduce((r, reg) => {
      if (r) return r
      const moduleName = reg.exec(f.substring(0, f.lastIndexOf('/'))) && RegExp.lastMatch
      // resolve aliased plugin name
      r = pluginNameAliasesReverse[moduleName] || RegExp.$1
      return r
    }, '')
  }
  return ''
})

export const getPluginCfg = (name: string, ctx?: RollupContext): PluginOptions => {
  // evaluate project localize settings
  let cfg = result(get(ctx, `options.plugins.${name}`, {}), ctx)
  const f = defaultPluginOpts[name]
  if (f) {
    // mixin localize builtin options
    cfg = f(cfg, ctx)
  }
  return cfg
}

/**
 * Get plugin constructor by name
 */
export const getPluginCtor = (p: PluginConfig, cfg?: PluginOptions): PluginStruct => {
  p = (typeof p === 'string' ? loadPlugin<PluginImpl>(p) : p) as PluginStruct
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
  name = name || getPluginRefName(p) || p.name

  const cfg = typeof name === 'string' ? getPluginCfg(name, ctx) : {}
  p = getPluginCtor(p || name, cfg)
  return result(p, {})
}
