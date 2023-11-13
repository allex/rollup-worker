/**
 * Provide some built-in plugins for Rollup worker
 *
 * MIT Licensed
 *
 * Authors:
 *   Allex Wang <allex.wxn@gmail.com> (http://iallex.com/)
 */

import { merge } from '@fdio/utils'
import { dirname, extname } from 'path'

import autoprefixer from 'autoprefixer'
import cssnano from 'cssnano'

import configLoader from '../utils/configLoader'
import { PluginContext } from '../types'

// Extensions to use when resolving modules
const EXTENSIONS = ['.ts', '.tsx', '.js', '.jsx', '.es6', '.es', '.mjs']

type PluginOptionsResolver = (options: Kv, ctx: PluginContext) => unknown

const findTsConfig = (
  entryFile: string,
  {
    cwd = dirname(entryFile),
    stopDir = process.cwd()
  }: Dictionary<'cwd' | 'stopDir', string> = {}
) => configLoader.resolve({ cwd, stopDir, files: ['tsconfig.json'] })

// Provide default options for builtin plugins

const defaultPluginOpts: Kv<PluginOptionsResolver> = {
  resolve (o) {
    // For more resolve options see <https://github.com/rollup/plugins/tree/master/packages/node-resolve>
    // pay attention to [module/jsnext/browser/main] orders
    return merge(
      {
        jsnext: true,
        module: true,
        browser: true,
        main: true,
        // prefer local modules for browser
        preferBuiltins: false,
        moduleDirectories: [
          'node_modules'
        ]
      }, o
    )
  },

  json (o) {
    return { indent: '  ', ...o }
  },

  // For internal custom babel configs
  // https://github.com/rollup/plugins/tree/master/packages/babel#options
  babel (o, { input, output, options }) {
    const {
      defines = {}
    } = options
    const useTypescript = typeof input === 'string' && ['.ts', '.tsx'].includes(extname(input)) || false
    const modern = (output.format as string) === 'modern'
    return merge(
      {
        extensions: EXTENSIONS,
        exclude: 'node_modules/**',
        passPerPreset: true, // @see https://babeljs.io/docs/en/options#passperpreset
        babelHelpers: 'bundled',
        custom: {
          defines,
          modern,
          compress: !!options.compress,
          sourcemap: options.sourcemap,
          targets: options.target === 'node' ? { node: '8' } : undefined,
          pragma: options.jsx || 'h',
          pragmaFrag: options.jsxFragment || 'Fragment',
          typescript: !!useTypescript,
          jsxImportSource: options.jsxImportSource || false,
          vue: !!options.vue,
          react: !!options.react
        }
      }, o
    )
  },

  commonjs (o, { options }) {
    return {
      extensions: EXTENSIONS,
      sourcemap: options.sourcemap,
      ...o }
  },

  typescript (o, { input, options }) {
    const spec = merge({
      compilerOptions: {
        sourceMap: options.sourcemap,
        target: 'esnext',
        newLine: 'lf'
      }
    }, o)
    if (options.autoTsconfig && !o.tsconfig && typeof input === 'string') {
      o.tsconfig = findTsConfig(input)
    }
    return spec
  },

  globals (o, { output: { format } }) {
    return {
      ...(
        ['es', 'cjs'].includes(format) ? {
          process: false,
          buffer: false
        } : {}
      ),
      ...o
    }
  },

  replace (o) {
    return merge({
      preventAssignment: true,
      values: {
        NODE_ENV: process.env.NODE_ENV || 'production'
      }
    }, o)
  },

  minimize (o, { output: { format } }) {
    const modern = (format as string) === 'modern'
    return {
      implementation: require('@rollup/plugin-terser'),
      // options for rollup-plugin-terser <https://github.com/terser/terser>
      options: merge({
        ie8: true,
        compress: {
          drop_console: !(format === 'cjs' || format === 'es')
        },
        output: {
          shebang: true,
          indent_level: 2
        },
        module: modern || format === 'cjs' || format === 'es',
        ecma: modern ? 2017 : 5,
        toplevel: modern || format === 'cjs' || format === 'es'
      }, o)
    }
  },

  postcss (o, { options }) {
    return merge({
      plugins: [
        autoprefixer(),
        options.minimize !== false &&
          cssnano({
            preset: 'default'
          })
      ].filter(Boolean),
      // only write out CSS for the first bundle (avoids pointless extra files):
      inject: true,
      extract: false
    }, o)
  }
}

export const getMergedOptions = <T> (name: string, o: Kv, context: PluginContext): T => {
  const func = defaultPluginOpts[name]
  if (func) {
    return func(o, context) as T
  }
  return o as T
}
