/**
 * Provide some built-in plugins for Rollup worker
 *
 * MIT Licensed
 *
 * Authors:
 *   Allex Wang <allex.wxn@gmail.com> (http://iallex.com/)
 */

import { merge } from '@fdio/utils'
import path from 'path'

export const defaultPluginOpts = {
  resolve (o: PluginOptions) {
    // For more resolve options see <https://www.npmjs.com/package/resolve>
    // pay attention to [module/jsnext/browser/main] orders
    return {
      jsnext: true,
      module: true,
      browser: true,
      main: true,
      // prefer local modules for browser
      preferBuiltins: false,
      customResolveOptions: {
        paths: [path.resolve(process.cwd(), 'node_modules')]
      },
      ...o }
  },

  json (o: PluginOptions) {
    return {
      indent: '  ',
      ...o }
  },

  babel (o: PluginOptions) {
    return {
      ...o }
  },

  commonjs (o: PluginOptions) {
    return {
      extensions: ['.js', '.ts', '.coffee'],
      ...o }
  },

  typescript (o: PluginOptions, ctx: RollupContext) {
    const { output: { format } } = ctx
    return merge({
      check: true,
      abortOnError: false,
      cacheRoot: `./node_modules/.cache/.rts2_cache_${format}`,
      tsconfigOverride: {
        compilerOptions: {
          newLine: 'lf'
        }
      }
    }, o)
  },

  replace (o: PluginOptions) {
    return {
      NODE_ENV: process.env.NODE_ENV || 'production',
      ...o
    }
  },

  minify (o: PluginOptions) {
    // options for rollup-plugin-terser <https://github.com/terser/terser>
    return merge({
      module: true,
      ie8: true,
      compress: {
        drop_console: true
      },
      signature: true
    }, o)
  }
}
