import commonjs from '@rollup/plugin-commonjs'
import nodeResolve from '@rollup/plugin-node-resolve'
import progressPlugin from 'rollup-plugin-progress'
import json5 from 'rollup-plugin-json5'
import typescript from '@rollup/plugin-typescript'

import { dependencies } from './package.json'

const progress = () => {
  if (process.env.TRAVIS || process.env.NETLIFY) {
    return {};
  }
  return progressPlugin();
};

export default [ {
  plugins: [
    json5(),
    nodeResolve({
      jsnext: true, browser: true, module: true, main: true }),
    typescript(),
    commonjs(),
    progress()
  ],
  external: Object.keys(dependencies)
    .concat(['fs', 'path', 'events', 'module', 'util', 'os']),
  input: {
    'bin/cli.js': 'src/bin/cli.ts'
  },
  output: [
    {
      dir: '.',
      format: 'cjs',
      entryFileNames: '[name]',
      chunkFileNames: 'lib/[name].js',
      manualChunks: {
        'rollup-worker': ['src/index.ts']
      }
    }
  ]
} ]
