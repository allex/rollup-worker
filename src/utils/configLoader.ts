import fs from 'fs'
import p from 'path'
import { promisify } from 'util'

interface ConfigLoaderOptions<T> {
  files?: string[];
  cwd?: string;
  stopDir?: string;
  packageKey?: string;
  parseJSON?: (o: string) => any;
}

interface ILoader {
  name: string;
  test?: RegExp;
  load (): Promise<any>;
}

// async read file
// @returns {Promise<T>}
const readFile = promisify(fs.readFile)

// check if a file exists (async)
// @returns {Promise<T>}
// eslint-disable-next-line no-unused-vars
const pathExists = (p: string): Promise<boolean> => new Promise<boolean>(resolve => {
  fs.access(p, err => resolve(!err))
})

// check if a file exists (sync)
const pathExistsSync = fs.existsSync

export class ConfigLoader {
  options: ConfigLoaderOptions

  // cache file exists state
  existsCache = new Map<string, boolean>()

  // cache loader for localize transform
  loaders = new Set<ILoader>()

  /**
   * We need to read package json data in `.resolve` method to check if `packageKey` exists in the file
   * So it makes sense to cache it if the `.resolve` method is called by `.load` method
   * @type {Set<string, any>}
   */
  pkgCache = new Map<string, any>()

  constructor ({
    files,
    cwd = process.cwd(),
    stopDir,
    packageKey,
    parseJSON = JSON.parse
  }: ConfigLoaderOptions = {}) {
    if (stopDir) {
      stopDir = p.resolve(stopDir)
    }
    this.options = { files, cwd, stopDir, packageKey, parseJSON }
  }

  addLoader (loader: ILoader) {
    this.loaders.add(loader)

    return this
  }

  removeLoader (name: string) {
    for (const loader of this.loaders) {
      if (name && loader.name === name) {
        this.loaders.delete(loader)
      }
    }

    return this
  }

  /**
   *  Find a loader for given path
   *
   * @param {string} filepath file path
   * @return {Loader|null}
   */
  findLoader (filepath: string): ILoader | null {
    for (const loader of this.loaders) {
      if (loader.test && loader.test.test(filepath)) {
        return loader
      }
    }

    return null
  }

  /**
   * Find specific file up-recusively
   */
  findUp (
    currentDir: string,
    options: ConfigLoaderOptions
  ): string | null {
    const { files, packageKey } = options
    for (const filename of files) {
      const file = p.resolve(currentDir, filename)
      const exists =
        // Disable cache in tests
        process.env.NODE_ENV !== 'test' && this.existsCache.has(file)
          ? this.existsCache.get(file)
          : pathExistsSync(file)

      this.existsCache.set(file, exists)

      if (exists) {
        // If there's no `packageKey` option or this is not a `package.json` file
        if (!packageKey || p.basename(file) !== 'package.json') {
          return file
        }

        // For `package.json` and `packageKey` option
        // We only consider it to exist when the `packageKey` exists
        const data = require(file)
        delete require.cache[file]

        const hasPackageKey = Object.prototype.hasOwnProperty.call(data, packageKey)
        // The cache will be usd in `.load` method
        // But not in the next `require(filepath)` call since we deleted it after require
        // For `package.json`
        // If you specified the `packageKey` option
        // It will only be considered existing when the property exists
        if (hasPackageKey) {
          this.pkgCache.set(file, data)
          return file
        }
      }
    }

    const nextDir = p.dirname(currentDir)

    // Don't traverse above the module root
    if (
      nextDir === currentDir ||
      currentDir === options.stopDir ||
      p.basename(currentDir) === 'node_modules'
    ) {
      return null
    }

    // Continue in the parent directory
    return this.findUp(nextDir, options)
  }

  resolve (opts: ConfigLoaderOptions): string {
    const { cwd, ...options } = this.normalizeOptions(opts)
    return this.findUp(cwd, options)
  }

  async load <T = any> (
    opts: ConfigLoaderOptions
  ): Promise<{ path: string; data: T | null; } | null> {
    const { cwd, ...options } = this.normalizeOptions(opts)
    const filepath = this.findUp(cwd, options)

    if (filepath) {
      const loader = this.findLoader(filepath)
      if (loader) {
        return {
          path: filepath,
          data: await loader.load(filepath)
        }
      }

      let data: T | null = null

      const extname = p.extname(filepath).slice(1)
      if (extname === 'js') {
        delete require.cache[filepath]
        data = require(filepath)
      } else if (extname === 'json') {
        if (this.pkgCache.has(filepath)) {
          data = this.pkgCache.get(filepath)[options.packageKey]
        } else {
          data = this.options.parseJSON(await readFile(filepath))
        }
      } else {
        // Don't parse data if it's neither .js nor .json
        // Leave this to user-land
        data = await readFile(filepath)
      }

      return {
        path: filepath,
        data
      }
    }

    return null
  }

  clearCache () {
    this.existsCache.clear()
    this.pkgCache.clear()

    return this
  }

  normalizeOptions (opts: ConfigLoaderOptions): ConfigLoaderOptions {
    const options = { ...this.options, ...opts } // shadow clone

    options.cwd = p.resolve(options.cwd)
    options.stopDir = options.stopDir ? p.resolve(options.stopDir) : p.parse(options.cwd).root

    if (!options.files || options.files.length === 0) {
      throw new Error('files must be an non-empty array!')
    }

    return options
  }
}

export default new ConfigLoader({
  stopDir: p.dirname(process.cwd())
})
