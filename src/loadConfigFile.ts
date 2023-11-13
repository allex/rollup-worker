import { extname, isAbsolute } from 'path'
import { pathToFileURL } from 'url'
import rollup, { Plugin, RollupOptions } from 'rollup'

import { BundlerOptions, GenericConfigObject, NormalizedBundlerOptions, RawOutputOptions } from './types'
import { asArray, relativeId } from './utils'
import batchWarnings, { BatchWarnings } from './utils/batchWarnings'
import { stderr } from './utils/logging'
import { bold } from './utils/colors'
import { error } from './utils/error'

interface NodeModuleWithCompile extends NodeModule {
  _compile(code: string, filename: string): any;
}

const isNativeRollupConfig = (o: unknown): o is Many<RollupOptions> =>
  asArray(o as BundlerOptions).every(o => !o.entry)

const transformFromRollupConfig = (cfg: Many<RollupOptions>): NormalizedBundlerOptions => {
  const ret: NormalizedBundlerOptions = { entry: [] }
  const rollupOpts = asArray(cfg)
  return rollupOpts.reduce((o, opt) => {
    const {
      output,
      plugins: rawPlugins,
      ...inputs
    } = opt
    const entry = o.entry
    const plugins = rawPlugins.reduce<Plugin[]>((list, p) => {
      if (p) {
        list.push(p)
      }
      return list
    }, [])
    if (output) {
      entry.push({ ...inputs, plugins, output: asArray(output) as RawOutputOptions[] })
    } else {
      entry.push({ ...inputs, plugins, output: [] })
    }
    return o
  }, ret)
}

export async function loadAndParseConfigFile(
  fileName: string,
  commandOptions: Kv
): Promise<{
  options: NormalizedBundlerOptions;
  warnings: BatchWarnings;
}> {
  const configs = await loadConfigFile(fileName, commandOptions)
  const warnings = batchWarnings()

  let options: NormalizedBundlerOptions

  if (isNativeRollupConfig(configs)) {
    // adapter options is a native rollup configs
    options = transformFromRollupConfig(configs)
  } else {
    const arr = configs as any[]
    if (arr.length > 1) {
      throw new Error('invalid bundler options')
    }

    const { entry, ...rest } = arr[0]
    if (!entry) {
      throw new Error('`entry` cannot be nil')
    }

    options = {
      ...rest,
      entry: asArray(entry)
    }
  }

  return { options, warnings }
}

export async function loadConfigFile (configFile: string, commandOptions: Kv = {}): Promise<GenericConfigObject[]> {
  const configFileExport = await getDefaultFromTranspiledConfigFile(configFile, commandOptions)
  return getConfigList(configFileExport, commandOptions);
}

function getDefaultFromCjs(namespace: GenericConfigObject): unknown {
  return namespace.__esModule ? namespace.default : namespace
}

async function getDefaultFromTranspiledConfigFile(
  fileName: string,
  commandOptions: Kv
): Promise<unknown> {
  const warnings = batchWarnings()
  const inputOptions = {
    external: (id: string) =>
      (id[0] !== '.' && !isAbsolute(id)) || id.slice(-5, id.length) === '.json',
    input: fileName,
    onwarn: warnings.add,
    plugins: [],
    treeshake: false
  }
  const bundle = await rollup.rollup(inputOptions)
  if (!commandOptions.silent && warnings.count > 0) {
    stderr(bold(`loaded ${relativeId(fileName)} with warnings`))
    warnings.flush()
  }
  const {
    output: [{ code }]
  } = await bundle.generate({
    exports: 'named',
    format: 'cjs',
    plugins: [
      {
        name: 'transpile-import-meta',
        resolveImportMeta(property, { moduleId }) {
          if (property === 'url') {
            return `'${pathToFileURL(moduleId).href}'`
          }
          if (property == null) {
            return `{url:'${pathToFileURL(moduleId).href}'}`
          }
        }
      }
    ]
  })
  return loadConfigFromBundledFile(fileName, code)
}

function loadConfigFromBundledFile(fileName: string, bundledCode: string): unknown {
  const resolvedFileName = require.resolve(fileName)
  const extension = extname(resolvedFileName)
  // temporarily override require
  const defaultLoader = require.extensions[extension]
  require.extensions[extension] = (module: NodeModule, requiredFileName: string) => {
    if (requiredFileName === resolvedFileName) {
      (module as NodeModuleWithCompile)._compile(bundledCode, requiredFileName)
    } else {
      if (defaultLoader) {
        defaultLoader(module, requiredFileName)
      }
    }
  }
  delete require.cache[resolvedFileName]
  try {
    const config = getDefaultFromCjs(require(fileName))
    require.extensions[extension] = defaultLoader
    return config
  } catch (err: any) {
    if (err.code === 'ERR_REQUIRE_ESM') {
      return error({
        code: 'TRANSPILED_ESM_CONFIG',
        message: `While loading the Rollup configuration from "${relativeId(
          fileName
        )}", Node tried to require an ES module from a CommonJS file, which is not supported. A common cause is if there is a package.json file with "type": "module" in the same folder. You can try to fix this by changing the extension of your configuration file to ".cjs" or ".mjs" depending on the content, which will prevent Rollup from trying to preprocess the file but rather hand it to Node directly.`,
        url: 'https://rollupjs.org/guide/en/#using-untranspiled-config-files'
      })
    }
    throw err
  }
}

async function getConfigList(configFileExport: any, commandOptions: any): Promise<any[]> {
  const config = await (typeof configFileExport === 'function'
    ? configFileExport(commandOptions)
    : configFileExport);
  if (Object.keys(config).length === 0) {
    return error({
      code: 'MISSING_CONFIG',
      message: 'Config file must export an options object, or an array of options objects'
    });
  }
  return asArray(config)
}
