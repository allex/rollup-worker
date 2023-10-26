import progressPlugin from 'rollup-plugin-progress'
import typescript from '@rollup/plugin-typescript'
import eslint from '@rollup/plugin-eslint'

import { name, version, license, author, description, dependencies } from './package.json'

const banner = (name, short = false) => {
  let s
  if (short) {
    s = `/*! ${name} v${version} | ${license} licensed | ${author.name || author} */`
  } else {
    s = `/**
 * ${name} v${version} - ${description}
 *
 * @author ${author}
 * Released under the ${license} license.
 */`
  }
  return s
}

const progress = () => {
  if (process.env.TRAVIS || process.env.NETLIFY) {
    return {};
  }
  return progressPlugin()
}

export default {
  destDir: './',
  dependencies: Object.keys(dependencies).concat([ 'fs', 'path', 'module', 'events', 'assert', 'os', 'util', 'rollup-worker' ]),
  compress: process.env.NODE_ENV !== 'development',
  entry: [
    {
      input: 'src/index.ts',
      plugins: [ 'resolve', [typescript], 'commonjs', /* eslint, */ progress ],
      output: [
        { file: 'lib/rollup-worker.js', format: 'cjs', banner: banner(name, true) },
        { file: 'lib/rollup-worker.es.js', format: 'es', banner: banner(name, true) }
      ]
    },
    {
      input: 'src/bin/cli.ts',
      plugins: [ 'resolve', [typescript], 'commonjs', /* eslint, */ progress ],
      output: [
        {
          file: 'bin/cli.js',
          banner: '#!/usr/bin/env node',
          format: 'cjs',
          minify: { output: { beautify: true } },
          paths: {
            'rollup-worker': '../'
          }
        }
      ]
    }
  ]
}
