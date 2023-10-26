import fs from 'fs'
import mkdirp from 'mkdirp'
import path from 'path'
import resolveFrom from 'resolve-from'

const absolutePath = /^(?:\/|(?:[A-Za-z]:)?[\\|/])/

function isAbsolute (p) {
  return absolutePath.test(p)
}

export const uniq = <T> (list: T[]): T[] => list.reduce((p, o) => {
  if (!~p.indexOf(o)) p.push(o)
  return p
}, [] as T[])

export function relativeId (id) {
  if (typeof process === 'undefined' || !isAbsolute(id)) { return id }
  return path.relative(process.cwd(), id)
}

export function result (o, ...args) {
  return typeof o === 'function' ? o(...args) : o
}

export function mergeArray (p1, p2, { pk } = { pk: 'name' }) {
  p1 = [].concat(p1 || [])
  if (p2) {
    const ids = p1.map(o => o[pk] || o)
    p2.forEach(p => {
      if (!~ids.indexOf(p[pk] || p)) p1.push(p)
    })
  }
  return p1
}

export const writeFile = (file: string, code: string): Promise<boolean> => {
  return new Promise<boolean>((resolve, reject) => {
    mkdirp.sync(path.dirname(file))
    fs.writeFile(file, code, err => err ? reject(err) : resolve(true))
  })
}

export const resolveModule = (moduleName: string, paths?: string[]): string => {
  let modulePath: string = ''
  paths = paths || [process.cwd(), __dirname]
  for (const path of paths) {
    try {
      if ((modulePath = resolveFrom(path, moduleName))) {
        return modulePath
      }
    } catch (e) {}
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
  verbs?: readonly [string, string]
): string {
  const isSingleItem = list.length <= 1
  const quotedList = list.map(item => `"${item}"`)
  let output = isSingleItem
    ? quotedList[0]
    : `${quotedList.slice(0, -1).join(', ')} and ${quotedList.slice(-1)[0]}`
  if (verbs) {
    output += ` ${isSingleItem ? verbs[0] : verbs[1]}`
  }
  return output
}
