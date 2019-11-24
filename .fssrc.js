import progressPlugin from 'rollup-plugin-progress'
import typescript from 'rollup-plugin-typescript'
import { eslint } from 'rollup-plugin-eslint'

import { dependencies } from './package.json'

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
      plugins: [ 'resolve', [typescript], 'commonjs', eslint, progress ],
      output: [
        { file: 'lib/rollup-worker.js', format: 'cjs' },
        { file: 'lib/rollup-worker.es.js', format: 'es' }
      ]
    },
    {
      input: 'src/bin/cli.ts',
      plugins: [ 'resolve', [typescript], 'commonjs', eslint, progress ],
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
