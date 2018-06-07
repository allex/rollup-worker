import path from 'path'
import rollup from 'rollup'
import chalk from 'chalk'

import { relativeId } from './utils'
import { stderr, handleError } from './logging'
import batchWarnings from './batchWarnings'

export default function loadConfigFile (configFile, commandOptions = {}) {
  let silent = commandOptions.silent || false
  let warnings = batchWarnings()
  return rollup
    .rollup({
      input: configFile,
      external(id) {
        return (id[0] !== '.' && !path.isAbsolute(id)) || id.slice(-5, id.length) === '.json'
      },
      onwarn: warnings.add
    })
    .then((bundle) => {
      if (!silent && warnings.count > 0) {
        stderr(chalk.bold('loaded ' + relativeId(configFile) + ' with warnings'))
        warnings.flush()
      }
      return bundle.generate({ format: 'cjs' })
    })
    .then(({ code }) => {
      // temporarily override require
      let defaultLoader = require.extensions['.js'] // eslint-disable-line
      require.extensions['.js'] = (module, filename) => { // eslint-disable-line
        if (filename === configFile) {
          module._compile(code, filename)
        } else {
          defaultLoader(module, filename)
        }
      }
      delete require.cache[configFile]
      return Promise.resolve(require(configFile))
        .then((configFileContent) => {
          if (typeof configFileContent === 'function') {
            return configFileContent(commandOptions)
          }
          return configFileContent
        })
        .then((configs) => {
          if (Object.keys(configs).length === 0) {
            handleError({
              code: 'MISSING_CONFIG',
              message: 'Config file must export an options object, or an array of options objects',
              url: 'https://rollupjs.org/#using-config-files'
            })
          }
          require.extensions['.js'] = defaultLoader // eslint-disable-line
          return Array.isArray(configs) ? configs : [configs]
        })
    })
}
