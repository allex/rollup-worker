// .fssrc.ts
// by @allex_wang

import MagicString from 'magic-string'
import progressPlugin from 'rollup-plugin-progress'

import { BundlerOptions, Plugin } from './src/types'

import { name, version, license, author, description } from './package.json'

const banner = (short = false) => {
  let s
  if (short) {
    s = `/*! ${name} v${version} | ${license} licensed | ${(author as any).name || author} */`
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
    return {}
  }
  return progressPlugin()
}

function addShebang(): Plugin {
  return {
    name: 'add-shebang',
    renderChunk(code, chunkInfo) {
      if (chunkInfo.fileName === 'bin/cli.js') {
        const magicString = new MagicString(code);
        magicString.prepend('#!/usr/bin/env node\n\n');
        return { code: magicString.toString(), map: magicString.generateMap({ hires: true }) }
      }
      return null
    }
  }
}

const spec: BundlerOptions = {
  destDir: './',
  dependencies: [
    'fs',
    'path',
    'os',
    'events',
    'util',
    'assert',
    'process',
    'url',
    'child_process'
  ],
  entry: [
    {
      input: {
        'bin/cli': 'src/bin/cli.ts'
      },
      treeshake: {
        moduleSideEffects: false
      },
      plugins: [
        'resolve',
        'typescript',
        'commonjs',
        progress(),
        process.env.NODE_ENV !== 'development' ? ['minimize', { output: { beautify: true } }] : null,
        addShebang(),
      ],
      output: [
        {
          chunkFileNames: 'lib/[name].js',
          dir: './',
          format: 'cjs',
          get banner() {
            return banner()
          },
          manualChunks: { 'bundler': ['src/index.ts'] },
        }
      ]
    }
  ]
}

export default spec
