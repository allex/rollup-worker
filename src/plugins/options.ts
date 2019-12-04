/**
 * Provide some built-in plugins for Rollup worker
 *
 * MIT Licensed
 *
 * Authors:
 *   Allex Wang <allex.wxn@gmail.com> (http://iallex.com/)
 */

import { merge } from '@fdio/utils'
import { basename, dirname, extname, relative, resolve } from 'path'

import autoprefixer from 'autoprefixer'
import cssnano from 'cssnano'

// Extensions to use when resolving modules
const EXTENSIONS = ['.ts', '.tsx', '.js', '.jsx', '.es6', '.es', '.mjs']

interface IPluginOptionsFactory {
  [name: string]: <T extends PluginOptions> (options: T, ctx: RollupContext) => T;
}

// Provide default options for builtin plugins
export const defaultPluginOpts: IPluginOptionsFactory = {
  resolve (o) {
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
        paths: [resolve(process.cwd(), 'node_modules')]
      },
      ...o }
  },

  json (o) {
    return {
      indent: '  ',
      ...o }
  },

  // For internal custom babel configs
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
        custom: {
          defines,
          modern,
          compress: !!options.compress,
          sourcemap: options.sourcemap,
          targets: options.target === 'node' ? { node: '8' } : undefined,
          pragma: options.jsx || 'h',
          pragmaFrag: options.jsxFragment || 'Fragment',
          typescript: !!useTypescript,
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

  typescript (o, { options, output: { format } }) {
    return merge(
      {
        check: true,
        abortOnError: false,
        cacheRoot: `./node_modules/.cache/.rts2_cache_${format}`,
        tsconfigDefaults: {
          compilerOptions: {
            sourceMap: options.sourcemap,
            jsx: 'react',
            declaration: true
          }
        },
        // some ts options to been force overwrit
        tsconfigOverride: {
          compilerOptions: {
            target: 'esnext',
            newLine: 'lf'
          }
        }
      }, o
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
    return {
      NODE_ENV: process.env.NODE_ENV || 'production',
      ...o
    }
  },

  minify (o, { output: { format } }) {
    // options for rollup-plugin-terser <https://github.com/terser/terser>
    return merge({
      module: true,
      ie8: true,
      toplevel: format === 'cjs' || format === 'es',
      compress: {
        drop_console: !(format === 'cjs' || format === 'es')
      },
      output: {
        indent_level: 2
      },
      signature: true
    }, o)
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
