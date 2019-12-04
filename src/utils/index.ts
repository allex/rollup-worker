import { hasOwn, memoize } from '@fdio/utils'
import fs from 'fs'
import mkdirp from 'mkdirp'
import path from 'path'
import resolveFrom from 'resolve-from'

const absolutePath = /^(?:\/|(?:[A-Za-z]:)?[\\|/])/
function isAbsolute (p) {
  return absolutePath.test(p)
}

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

const isBuiltInPackage = memoize((pkgName: string): boolean => {
  const deps = require('../package').dependencies
  return hasOwn(deps, pkgName)
})

export const resolvePackage = memoize((
  pkgName: string,
  { cwd = process.cwd() }: { cwd?: string } = {}
): string => {
  cwd = cwd || process.cwd()
  return isBuiltInPackage(pkgName)
    ? require.resolve(pkgName)
    : resolveFrom.silent(cwd, pkgName) || require.resolve(pkgName)
})

export const localRequire = (
  name: string,
  { cwd = process.cwd(), silent }: { silent?: boolean; cwd?: string } = {}
) => {
  const resolved = silent
    ? resolveFrom.silent(cwd, name)
    : resolveFrom(cwd, name)
  return resolved && require(resolved)
}
