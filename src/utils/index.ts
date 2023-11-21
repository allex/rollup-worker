import fs from 'fs'
import path from 'path'

import mkdirp from 'mkdirp'
import resolveFrom from 'resolve-from'

const absolutePath = /^(?:\/|(?:[A-Za-z]:)?[\\|/])/

function isAbsolute (p: string) {
  return absolutePath.test(p)
}

export const uniq = <T> (list: T[]): T[] =>
  list.reduce((p, o) => {
    if (!~p.indexOf(o)) p.push(o)
    return p
  }, [] as T[])

export function relativeId (id: string) {
  if (typeof process === 'undefined' || !isAbsolute(id)) { return id }
  return path.relative(process.cwd(), id)
}

type Func<T> = ((...args: any[]) => T)

export function result <T> (o: T | Func<T>, ...args: any[]): T {
  return typeof o === 'function' ? (o as Func<T>)(...args) : o
}

export function mergeArray (p1, p2, { pk } = { pk: 'name' }) {
  p1 = [].concat(p1 || [])
  if (p2) {
    const ids = p1.map(o =>
      o[pk] || o)
    p2.forEach(p => {
      if (!~ids.indexOf(p[pk] || p)) p1.push(p)
    })
  }
  return p1
}

export const writeFile = (file: string, code: string): Promise<boolean> =>
  new Promise<boolean>((resolve, reject) => {
    mkdirp.sync(path.dirname(file))
    fs.writeFile(file, code, err =>
      (err ? reject(err) : resolve(true)))
  })

export const resolveModule = (moduleName: string, paths?: string[]): string => {
  let modulePath: string = ''
  paths = paths || [process.cwd(), __dirname]
  for (const path of paths) {
    try {
      if ((modulePath = resolveFrom(path, moduleName))) {
        return modulePath
      }
    } catch (e) { /* empty */ }
  }
  return modulePath
}

export const loadModule = <T = any> (moduleName: string, paths?: string[]): T => {
  paths = paths || [process.cwd(), __dirname]
  const p = resolveModule(moduleName, paths)
  if (!p) {
    throw new Error(`Resolve module ${moduleName} failed in paths: ${paths.join(',')}`)
  }
  return require(p) as T
}

export function getOrCreate<K, V> (map: Map<K, V>, key: K, init: () => V): V {
  const existing = map.get(key)
  if (existing) {
    return existing
  }
  const value = init()
  map.set(key, value)
  return value
}

export function printQuotedStringList (
  list: readonly string[],
  verbs?: readonly [string, string],
): string {
  const isSingleItem = list.length <= 1
  const quotedList = list.map(item =>
    `"${item}"`)
  let output = isSingleItem
    ? quotedList[0]
    : `${quotedList.slice(0, -1).join(', ')} and ${quotedList.slice(-1)[0]}`
  if (verbs) {
    output += ` ${isSingleItem ? verbs[0] : verbs[1]}`
  }
  return output
}

export const asArray = <T>(o: T | T[]): T[] =>
  (Array.isArray(o) ? o : [o])

const boolValues = {
  1: true,
  0: false,
  Y: true,
  N: false,
  yes: true,
  no: false,
  true: true,
  false: false,
  on: true,
  off: true,
}

export const parseBoolValue = (v: string | number, defaultVal: boolean = false): boolean =>
  (Object.prototype.hasOwnProperty.call(boolValues, v) ? boolValues[v] : defaultVal)

export const defaultTo = <T>(v: any, defval: T): T =>
  (v != null ? v as T : defval)
