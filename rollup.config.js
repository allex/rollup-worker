import commonjs from 'rollup-plugin-commonjs'
import nodeResolve from '@allex/rollup-plugin-node-resolve'
import progressPlugin from 'rollup-plugin-progress'
import typescript from 'rollup-plugin-typescript'
import { dependencies } from './package.json'

const progress = () => {
  if (process.env.TRAVIS || process.env.NETLIFY) {
    return {};
  }
  return progressPlugin();
};

export default [ {
  input: 'src/index.ts',
  plugins: [
    nodeResolve({
      jsnext: true, browser: true, module: true, main: true }),
    typescript(),
    commonjs(),
    progress()
  ],
  external: Object.keys(dependencies).concat([ 'fs', 'path', 'events', 'module', 'util', 'rollup-worker' ]),
  output: [
    { file: 'lib/rollup-worker.js', format: 'cjs' },
    { file: 'lib/rollup-worker.es.js', format: 'es' }
  ]
}, {
  input: 'src/bin/cli.ts',
  plugins: [
    nodeResolve({
      jsnext: true, browser: true, module: true, main: true }),
    typescript(),
    commonjs(),
    progress()
  ],
  external: Object.keys(dependencies).concat([ 'fs', 'path', 'module', 'events', 'rollup-worker', 'assert', 'os', 'util' ]),
  output: [
    {
      file: 'bin/cli.js',
      banner: '#!/usr/bin/env node',
      format: 'cjs',
      paths: {
        'rollup-worker': '../'
      }
    }
  ]
} ]
