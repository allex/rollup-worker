# rollup-worker

> Based on rollup with some built-in plugins, make configure more simple and integrations.  
> Make `.fssrc.js` as the cli default config file.
> 
> Share some common plugins settings between multiple entries.

## Installation

```sh
$ npm i -g rollup-worker@next
```

## Usage

```sh
# default config: .fssrc.js
$ rb [ -c .fssrc.js ]
```

## Example

cat .fssrc.js

```js
const { version, name, author, dependencies } = require('./package.json')
const banner = `/*! ${name} v${version} | ${license || 'MIT'} licensed. | by ${author} */`

// Optional enable some builtin plugins
const plugins = [
  'node-builtins',
  'resolve',
  'typescript',
  'commonjs',
  'babel',
  'globals'
]

module.exports = {
  plugins: {
    babel ({ output: { format } }) {
      const babelrc = {}
      if ([ 'es', 'cjs' ].includes(format)) {
        babelrc.comments = true
      }
      return babelrc
    },
    resolve ({ output: { format } }) {
      return {
        preferBuiltins: false,
        customResolveOptions: {
          moduleDirectory: /min|umd|iife/.test(format) ? [ 'src', 'node_modules' ] : [ 'src' ]
        }
      }
    },
    typescript (rollupCfg) {
      return { 
        typescript: require('@allex/typescript'), // custom tsc engine
        tsconfigOverride: {
          compilerOptions: {
            newLine: "lf"
          }
        }
      }
    },
    globals ({ output }) {
      return output.format === 'es' ? {
        process: false,
        buffer: false
      } : {}
    },
    minimize: { // for terser
      ie8: false
    },
    replace: {
      __VERSION__: version
    }
  },
  entry: [
    {
      input: './src/worker/index.ts',
      plugins,
      output: [
        { format: 'es', file: 'worker.esm.js' },
        { format: 'umd', file: 'worker.js', name: 'FooWorker', banner }
      ]
    },
    {
      input: './src/app/main.ts',
      plugins,
      output: [
        { format: 'iife', compress: true, file: 'app/main.js', banner }
      ]
    }
  ]
}
```

## License

[MIT](https://allex.github.io/LICENSE.md)
