import p from 'path'
import fs from 'fs'
import Worker from 'rollup-worker'
import watch from './watch'

let argv = process.argv.slice(2)
let configFile = p.resolve(process.cwd(), '.fssrc.js')
let watchMode = false

// parse --config from argv
while (argv.length) {
  var k = argv.shift(), v = argv[0]
  switch (k) {
    case '-c':
    case '--config':
      if (v && v.charAt(0) !== '-') {
        configFile = p.resolve(process.cwd(), v)
        argv.shift()
      }
      break
    case '-w':
      watchMode = true
      break
  }
}

if (!configFile || !fs.existsSync(configFile)) {
  console.error('config file not valid. \n rollup-bundle --config <config_file.js> \n(exit 1)')
  process.exit(1)
}

const build = configs => new Worker(configs).build()

Worker.loadConfigFile(configFile)
  .then((configs) => {
    configs = configs.map(o => o.rollup || o)
    if (configs.some(o => o.entry)) {
      configs = configs[0]
    }
    if (watchMode) {
      watch(configFile, configs)
    } else {
      // build
      return build(configs)
    }
  })
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })

export default { build, watch }
