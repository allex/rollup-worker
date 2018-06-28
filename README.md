# rollup-worker

Rollup worker for multiple entry bundle with customize distributes.

## Installation

```bash
$

npm i -g rollup-worker@next

rollup-worker --config <CONFIG_FILE.js>
```

## Usage

rollup config file

```js
// cat .fssrc.js
import path from 'path'
import coffee from 'rollup-plugin-coffee-script'

const { version, name, author, dependencies } = require('./package.json')

// add some customize plugins with builtins
const plugins = [
  coffee(),
  'resolve',
  'commonjs'
]

const babelConfig = { ... }

module.exports = {
  rollup: {
    destDir: path.join(__dirname, './'),
    pluginOptions: {
      babel: (rollupCfg) => {
        const babelrc = Object.assign({}, babelConfig)
        if ([ 'es', 'cjs' ].includes(rollupCfg.output.format)) {
          babelrc.comments = true
        }
        return babelrc
      },
      nodeResolve: (rollupCfg) => {
        const format = rollupCfg.output.format
        return {
          preferBuiltins: false,
          customResolveOptions: {
            moduleDirectory: /min|umd|iife/.test(format) ? [ 'src', 'node_modules' ] : [ 'src' ]
          }
        }
      },
      uglifyjs: {
        ie8: false
      }
    },
    entry: [
      {
        input: './pace.coffee',
        plugins,
        output: [
          {
            format: 'es',
            file: 'pace.esm.js'
          },
          {
            format: 'umd',
            name: 'Pace',
            file: 'pace.js',
            banner: `/*! ${name} v${version} | ${license || 'MIT'} Licensed. | By ${author} */\n`
          }
        ]
      },
      {
        input: './docs/lib/themes.coffee',
        plugins,
        output: [
          {
            format: 'iife',
            minimize: true,
            file: 'docs/lib/themes.js'
          }
        ]
      }
    ]
  }
}
```

```js
// cat build.js

'use strict'

const Rollup = require('rollup-worker')
const config = require('./.fssrc.js')

const worker = new Rollup(config.rollup)
worker.build().then(err => console.error(err))
```

## License

[MIT](http://opensource.org/licenses/MIT)

[1]: https://lodash.com/docs/#mergeWith
