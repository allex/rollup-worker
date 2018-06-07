import babel from 'rollup-plugin-babel'
import commonjs from 'rollup-plugin-commonjs'
import nodeResolve from 'rollup-plugin-node-resolve'
import pkg from './package.json'
export default [ {
  input: 'src/rollup.js',
  plugins: [
    nodeResolve({
      jsnext: true, browser: true, module: true, main: true }),
    babel({
      babelrc: true,
      runtimeHelpers: true,
      exclude: 'node_modules/**' }),
    commonjs()
  ],
  external: Object.keys(pkg.dependencies).concat(['fs', 'path']),
  output: [
    { file: 'lib/rollup-worker.cjs.js', format: 'cjs' },
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
  external: [
    'fs',
    'path',
    'module',
    'events',
    'rollup',
    'assert',
    'os',
    'util'
  ],
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
