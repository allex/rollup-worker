// Re-exports some builtin plugins

import babel from 'rollup-plugin-babel'
import commonjs from 'rollup-plugin-commonjs'
import resolve from 'rollup-plugin-node-resolve'
import json from 'rollup-plugin-json5'

export {
  babel, commonjs, resolve, json
}
