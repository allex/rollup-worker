# rollup-worker

Rollup worker for multiple bundle with customize distributes.

## Installation

### NPM install

```sh
npm i rollup-worker
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
worker.build()
```

## License

[MIT](http://opensource.org/licenses/MIT)

[1]: https://lodash.com/docs/#mergeWith
