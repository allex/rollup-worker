/**
 * Provide some built-in plugins for Rollup worker
 *
 * MIT Licensed
 *
 * Authors:
 *   Allex Wang <allex.wxn@gmail.com> (http://iallex.com/)
 */

import path from 'path'

// some builtin plugins
import resolve from '@allex/rollup-plugin-node-resolve'
import babel from 'rollup-plugin-babel'
import commonjs from 'rollup-plugin-commonjs'
import json from 'rollup-plugin-json5'
import replace from 'rollup-plugin-replace'

import { deepAssign } from '@fdio/utils'

export const pluginImpls = {
  resolve,
  babel,
  commonjs,
  json,
  replace
}

export const defaultPluginOpts = {
  resolve (settings) {
    // For more resolve options see <https://www.npmjs.com/package/resolve>
    // pay attention to [module/jsnext/browser/main] orders
    return { jsnext: true,
      module: true,
      browser: true,
      main: true,
      // prefer local modules for browser
      preferBuiltins: false,
      customResolveOptions: {
        paths: [path.resolve(process.cwd(), 'node_modules')]
      },
      ...settings }
  },

  json (settings) {
    return { indent: '  ',
      ...settings }
  },

  babel (settings) {
    return {
      ...settings }
  },

  commonjs (settings) {
    return {
      extensions: ['.js', '.ts', '.coffee'],
      ...settings }
  },

  typescript (settings) {
    return deepAssign({
      check: true,
      abortOnError: false,
      tsconfigOverride: {
        compilerOptions: {
          newLine: 'lf'
        }
      }
    }, settings)
  },

  replace (settings) {
    return {
      NODE_ENV: process.env.NODE_ENV || 'production',
      ...settings
    }
  }
}
