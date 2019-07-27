import path from 'path'

/**
 * is it a string
 */
export function isString(o) {
  return typeof o === 'string' ||
    o instanceof String
}

/**
 * is Boolean or not
 */
export function isBoolean(o) {
  return typeof o === 'boolean'
}

/**
 * is void element or not ? Means it will return true when val is undefined or null
 */
export function isVoid(o) {
  return o === undefined || o === null
}

/**
 * to check whether a variable is array
 */
export function isArray(o) {
  return Array.isArray(o)
}

/**
 * is it a function or not
 */
export function isFunction(o) {
  return typeof o === 'function'
}

/**
 * is it an object or not
 */
export function isObject(o) {
  // incase of arrow function and array
  return Object(o) === o && String(o) === '[object Object]' && !isFunction(o) && !isArray(o)
}

/**
 * to tell you if it's a real number
 */
export function isNumber(o) {
  return typeof o === 'number'
}

/**
 * is Primitive type or not, whick means it will return true when data is number/string/boolean/undefined/null
 */
export function isPrimitive(val) {
  return isVoid(val) || isBoolean(val) || isString(val) || isNumber(val)
}

export function genTraversalHandler(fn) {
  function recursiveFn(source, target, key) {
    if (isArray(source) || isObject(source)) {
      target = isPrimitive(target)
        ? (isObject(source) ? {} : [])
        : target
      for (const key in source) {
        // $FlowFixMe: support computed key here
        target[key] = recursiveFn(source[key], target[key], key)
      }
      return target
    }
    return fn(source, target, key)
  }
  return recursiveFn
}

const _deepAssign = genTraversalHandler(val => val)

/**
 * deeply clone an object
 *
 * @param  {Array|Object} source if you pass in other type, it will throw an error
 * @return {clone-target}        the new Object
 */
export function deepClone(source) {
  if (isPrimitive(source)) {
    throw new TypeError('deepClone only accept non primitive type')
  }
  return _deepAssign(source)
}

/**
 * merge multiple objects
 *
 * @param  {...Object} args [description]
 * @return {merge-object}         [description]
 */
export function deepAssign(...args) {
  if (args.length < 2) {
    throw new Error('deepAssign accept two and more argument')
  }

  const target = args.shift()
  if (isPrimitive(target)) {
    throw new TypeError('deepAssign only accept non primitive type')
  }
  args.forEach(source => source && _deepAssign(source, target))

  return target
}

const absolutePath = /^(?:\/|(?:[A-Za-z]:)?[\\|/])/
function isAbsolute(p) {
  return absolutePath.test(p)
}

export function relativeId(id) {
  if (typeof process === 'undefined' || !isAbsolute(id)) { return id }
  return path.relative(process.cwd(), id)
}

export function sequence(array, fn) {
  const results = []
  let promise = Promise.resolve()
  function next(member, i) {
    return fn(member).then(value => (results[i] = value))
  }
  const loop = function (i) {
    promise = promise.then(() => next(array[i], i))
  }
  for (let i = 0; i < array.length; i += 1) {
    loop(i)
  }
  return promise.then(() => results)
}

export function result(o, ...args) {
  return typeof o === 'function' ? o(...args) : o
}

export function mergeArray(p1, p2, { pk } = { pk: 'name' }) {
  p1 = [].concat(p1 || [])
  if (p2) {
    const ids = p1.map(o => o[pk] || o)
    p2.forEach(p => {
      if (!~ids.indexOf(p[pk] || p)) p1.push(p)
    })
  }
  return p1
}
