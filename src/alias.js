import fs from 'fs'
import path from 'path'

const debug = require('debug')('rollup-worker:alias')

function startsWith (string, searchString) {
  const stringLength = string.length
  const searchLength = searchString.length

  // early out if the search length is greater than the search string
  if (searchLength > stringLength) {
    return false
  }
  let index = -1
  while (++index < searchLength) {
    if (string.charCodeAt(index) !== searchString.charCodeAt(index)) {
      return false
    }
  }
  return true
}

function resolvePath (importee, aliases) {
  let k, v
  for (k in aliases) {
    v = aliases[k]
    if (k === importee || startsWith(importee, k + '/')) {
      return v + importee.substr(k.length)
    }
  }
  return null
}

export default ({ aliases, jsnext }) => ({
  name: 'resolve-aliases',

  resolveId (importee, importer) {
    if (importee.charAt(0) === '.') {
      importee = path.resolve(importer, '..', importee)
    }

    let resolved = resolvePath(importee, aliases)
    if (resolved == null) {
      return
    }

    if (fs.statSync(resolved).isDirectory()) {
      const pkg = require(path.join(resolved, 'package.json'))
      const mainFields = [ 'module', 'main', 'jsnext:main', 'browser' ]
        .reduce((p, mainField) => {
          const t = pkg[mainField]
          if (t && p.indexOf(t) === -1) p.push(t)
          return p
        }, [])

      const main = mainFields.reduce((p, mainField) => {
        if (!p) {
          const f = path.join(resolved, mainField)
          if (fs.existsSync(f) && fs.statSync(f).isFile()) {
            return f
          }
        }
        return p
      }, '') || path.join(resolved, 'index.js')

      debug(`Main for ${importee} is ${main}`)
      resolved = main
    }

    debug(`Aliasing ${importee} to ${resolved}`)

    return resolved
  }
})
