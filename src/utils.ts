import path from 'path'

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
