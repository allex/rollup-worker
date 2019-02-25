# rollup-worker

> Based on rollup with some built-in plugins, make configure more simple and integrations.  
> Make `.fssrc.js` as the cli default config file.
> 
> Share some common plugins settings between multiple entries.

## Installation

```bash
npm i -g rollup-worker@next
```

## Usage

```sh
# default config: .fssrc.js
rollup-worker [ -c .fssrc.js ]
```

## sample config

cat .fssrc.js

```js
import path from 'path'

import builtins from 'rollup-plugin-node-builtins'
import globals from 'rollup-plugin-node-globals'
import babel from 'rollup-plugin-babel'
import typescript from 'rollup-plugin-typescript2'

const { version, name, author, dependencies } = require('./package.json')

cosnt banner = `/*! ${name} v${version} | ${license || 'MIT'} licensed. | by ${author} */`

// Add some customize plugins with builtins
const plugins = [
  [ 'builtins', builtins ],
  [ 'resolve' ],
  [ 'ts', typescript ],
  [ 'commonjs' ],
  [ 'babel', babel ],
  [ 'globals', globals ]
]

const babelConfig = { 
  babelrc: true
}

module.exports = {
  destDir: path.join(__dirname, './'),
  pluginOptions: {
    babel (rollupCfg) {
      const babelrc = Object.assign({}, babelConfig)
      if ([ 'es', 'cjs' ].includes(rollupCfg.output.format)) {
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
    ts (rollupCfg) {
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
    uglifyjs: {
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
        { format: 'iife', minimize: true, file: 'app/main.js', banner }
      ]
    }
  ]
}
```

## License

[MIT](https://allex.github.io/LICENSE.md)
