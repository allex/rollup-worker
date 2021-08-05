/**
 * Provide some built-in plugins for Rollup worker
 *
 * MIT Licensed
 *
 * Authors:
 *   Allex Wang <allex.wxn@gmail.com> (http://iallex.com/)
 */

import { merge } from '@fdio/utils'
import { dirname, extname, resolve } from 'path'

import autoprefixer from 'autoprefixer'
import cssnano from 'cssnano'

import configLoader from '../utils/configLoader'

// Extensions to use when resolving modules
const EXTENSIONS = ['.ts', '.tsx', '.js', '.jsx', '.es6', '.es', '.mjs']

type RollupContext = {
  input: Kv;
  output: Kv;
  options: Kv;
}

export type IPluginOptionParser <T = Kv> = (options: Partial<T>, ctx: RollupContext) => T;

const findTsconfig = (
  entryFile: string,
  {
    cwd = dirname(entryFile),
    stopDir = process.cwd()
  }: Dictionary<'cwd' | 'stopDir', string> = {}
) => configLoader.resolve({ cwd, stopDir, files: ['tsconfig.json'] })

// Provide default options for builtin plugins

const defaultPluginOpts: Kv<IPluginOptionParser> = {
  resolve (o) {
    // For more resolve options see <https://www.npmjs.com/package/resolve>
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
          resolve(process.cwd(), 'node_modules')
        ]
      }, o
    )
  },

  json (o) {
    return {
      indent: '  ',
      ...o }
  },

  // For internal custom babel configs
  // https://github.com/rollup/plugins/tree/master/packages/babel#options
  babel (o, { input, output, options }) {
    const {
      defines = {}
    } = options
    const useTypescript = ['.ts', '.tsx'].includes(extname(input))
    const modern = output.format === 'modern'
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

  typescript (o, { input, options, output: { format } }) {
    // resolve input tsconfig file
    const tsconfig = o.tsconfig || findTsconfig(input)

    // https://www.npmjs.com/package/rollup-plugin-typescript2#plugin-options
    return merge(
      {
        check: true,
        abortOnError: false,
        cacheRoot: `./node_modules/.cache/.rts2_cache_${format}`,
        // If true, declaration files will be emitted in the directory given in the
        // tsconfig. If false, the declaration files will be placed inside the destination
        // directory given in the Rollup configuration.
        useTsconfigDeclarationDir: false,
        tsconfigDefaults: {
          compilerOptions: {
            sourceMap: options.sourcemap,
            jsx: 'react',
            declaration: true,
            // tsc@4.3 defaults to true, https://www.typescriptlang.org/tsconfig#useDefineForClassFields
            useDefineForClassFields: false
          }
        },
        // some ts options to been force overwrite
        tsconfigOverride: {
          compilerOptions: {
            target: 'esnext',
            newLine: 'lf'
          }
        }
      }, { ...o, tsconfig }
    )
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

  minify (o, { output: { format } }) {
    const modern = format === 'modern'
    // options for rollup-plugin-terser <https://github.com/terser/terser>
    return merge(
      {
        ie8: true,
        compress: {
          drop_console: !(format === 'cjs' || format === 'es')
        },
        output: {
          indent_level: 2
        },
        signature: true,
        module: modern || format === 'cjs' || format === 'es',
        ecma: modern ? 2017 : 5,
        toplevel: modern || format === 'cjs' || format === 'es'
      }, o
    )
  },

  postcss (o, { options }) {
    return merge({
      plugins: [
        autoprefixer(),
        options.compress !== false &&
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

export const normalizeWithDefaultOptions = <T> (name: string, o: T, context: RollupContext): T => {
  const func = defaultPluginOpts[name]
  if (func) {
    return func(o, context)
  }
  return o
}
