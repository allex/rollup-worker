import babel from 'rollup-plugin-babel'
import commonjs from 'rollup-plugin-commonjs'
import nodeResolve from '@allex/rollup-plugin-node-resolve'
import { dependencies } from './package.json'
export default [ {
  input: 'src/index.js',
  plugins: [
    nodeResolve({
      jsnext: true, browser: true, module: true, main: true }),
    babel({
      babelrc: true,
      runtimeHelpers: true,
      exclude: 'node_modules/**' }),
    commonjs()
  ],
  external: Object.keys(dependencies).concat([ 'fs', 'path', 'events', 'module', 'util', 'rollup-worker' ]),
  output: [
    { file: 'lib/rollup-worker.js', format: 'cjs' },
    { file: 'lib/rollup-worker.es.js', format: 'es' }
  ]
}, {
  input: 'src/bin/cli.js',
  plugins: [
    nodeResolve({
      jsnext: true, browser: true, module: true, main: true }),
    babel({
      babelrc: true,
      runtimeHelpers: true,
      exclude: 'node_modules/**' }),
    commonjs()
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
}]
