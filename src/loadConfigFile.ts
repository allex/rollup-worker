import tc from 'chalk'
import path from 'path'
import rollup from 'rollup'

import { relativeId } from './utils'
import batchWarnings from './utils/batchWarnings'
import { handleError, stderr } from './utils/logging'

import { getPluginCtor } from './plugins'

const json = getPluginCtor('json')

export function loadConfigFile (
  configFile: string,
  commandOptions: any = {}
): Promise<InputOptions[]> {
  const silent = commandOptions.silent || false
  const warnings = batchWarnings()

  return rollup
    .rollup({
      input: configFile,
      treeshake: false,
      external: (id: string) => {
        return (id[0] !== '.' && !path.isAbsolute(id)) || id.slice(-5, id.length) === '.json'
      },
      onwarn: warnings.add,
      plugins: [json()]
    })
    .then((bundle: RollupBuild) => {
      if (!silent && warnings.count > 0) {
        stderr(tc.bold(`loaded ${relativeId(configFile)} with warnings`))
        warnings.flush()
      }

      return bundle.generate({
        format: 'cjs'
      })
    })
    .then(({ output: [{ code }] }: RollupOutput) => {
      // temporarily override require
      const defaultLoader = require.extensions['.js']
      require.extensions['.js'] = (module: NodeModuleWithCompile, filename: string) => {
        if (filename === configFile) {
          module._compile(code, filename)
        } else {
          defaultLoader(module, filename)
        }
      }

      delete require.cache[configFile]

      return Promise.resolve(require(configFile))
        .then(configFileContent => {
          if (typeof configFileContent === 'function') {
            return configFileContent(commandOptions)
          }
          return configFileContent
        })
        .then(configs => {
          if (Object.keys(configs).length === 0) {
            handleError({
              code: 'MISSING_CONFIG',
              message: 'Config file must export an options object, or an array of options objects',
              url: 'https://rollupjs.org/guide/en#configuration-files'
            })
          }

          require.extensions['.js'] = defaultLoader

          return Array.isArray(configs) ? configs : [configs]
        })
    })
    .catch((ex: any) => {
      const code = ex.code || ex.name
      let loc
      if (code === 'PARSE_ERROR' && (loc = ex.loc)) {
        stderr(`Parse error at ${loc.file}:${loc.line},${loc.column}`)
        stderr(ex.frame)
      }
      throw ex
    })
}
