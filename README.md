# rollup-worker

Rollup worker for multiple bundle with customize distributes.

## Installation

```bash
$

npm i rollup-worker

rollup-bundle --config <CONFIG_FILE.js>
```

## Usage

rollup config file

```js
// cat .fssrc.js
var path = require('path')
var coffee = require('rollup-plugin-coffee-script')
var pkg = require('./package.json')

var plugins = [ coffee() ]

module.exports = {
  rollup: {
    destDir: path.join(__dirname, './'),
    entry: [
      {
        input: './pace.coffee',
        plugins,
        targets: [
          {
            format: 'es',
            file: 'pace.esm.js'
          },
          {
            format: 'umd',
            name: 'Pace',
            file: 'pace.js',
            banner: `/*! ${pkg.name} ${pkg.version} */\n`
          }
        ]
      },
      {
        input: './docs/lib/themes.coffee',
        plugins,
        targets: [
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
