/**
 * Provide some built-in plugins for Rollup worker
 *
 * MIT Licensed
 *
 * Authors:
 *   Allex Wang <allex.wxn@gmail.com> (http://iallex.com/)
 */

import babel from 'rollup-plugin-babel'
import commonjs from 'rollup-plugin-commonjs'
import resolve from '@allex/rollup-plugin-node-resolve'
import json from 'rollup-plugin-json5'

export const pluginImpls = {
  resolve, json, babel, commonjs
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
      extensions: [ '.js', '.ts', '.coffee' ],
      ...settings }
  },

  typescript (settings) {
    return {
      check: true,
      abortOnError: false,
      ...settings }
  }
}