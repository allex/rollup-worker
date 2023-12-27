import { readFileSync, existsSync } from 'fs'
import {
  resolve, basename, dirname, extname, parse,
} from 'path'

interface ConfigLoaderOptions {
  files: string[];
  cwd: string;
  stopDir: string;
  packageKey: string;
  parseJSON: <T> (o: string) => T;
}

interface ILoader {
  name: string;
  test?: RegExp;
  load <T> (path: string): T;
}

export class ConfigLoader {
  options: ConfigLoaderOptions;

  // cache file exists state
  existsCache = new Map<string, boolean>();

  // cache loader for localize transform
  loaders = new Set<ILoader>();

  /**
   * We need to read package json data in `.resolve` method to check if `packageKey` exists in the file
   * So it makes sense to cache it if the `.resolve` method is called by `.load` method
   * @type {Set<string, any>}
   */
  pkgCache = new Map<string, any>();

  constructor ({
    files,
    cwd = process.cwd(),
    stopDir,
    packageKey,
    parseJSON = JSON.parse,
  }: Partial<ConfigLoaderOptions> = {}) {
    if (stopDir) {
      stopDir = resolve(stopDir)
    }
    this.options = {
      files, cwd, stopDir, packageKey, parseJSON,
    }
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
  findUp (currentDir: string, options: {
    files: string[];
    packageKey: string;
    stopDir: string;
  }): string | null {
    const { files, packageKey } = options
    for (const filename of files) {
      const file = resolve(currentDir, filename)
      // Disable cache in tests
      const exists = process.env.NODE_ENV !== 'test' && this.existsCache.has(file)
        ? this.existsCache.get(file)
        : existsSync(file)

      this.existsCache.set(file, exists)

      if (exists) {
        // If there's no `packageKey` option or this is not a `package.json` file
        if (!packageKey || basename(file) !== 'package.json') {
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

    const nextDir = dirname(currentDir)

    // Don't traverse above the module root
    if (
      nextDir === currentDir
      || currentDir === options.stopDir
      || basename(currentDir) === 'node_modules'
    ) {
      return null
    }

    // Continue in the parent directory
    return this.findUp(nextDir, options)
  }

  resolve (opts: Partial<ConfigLoaderOptions>): string {
    const { cwd, ...options } = this.normalizeOptions(opts)
    return this.findUp(cwd, options)
  }

  load <T> (opts: Partial<ConfigLoaderOptions>): { path: string; data: T | null; } | null {
    const { cwd, ...options } = this.normalizeOptions(opts)
    const filepath = this.findUp(cwd, options)

    if (!filepath) {
      return null
    }

    const loader = this.findLoader(filepath)
    if (loader) {
      return {
        path: filepath,
        data: loader.load(filepath),
      }
    }

    let data: T | null = null

    const ext = extname(filepath).slice(1)
    if (ext === 'js') {
      delete require.cache[filepath]
      data = require(filepath)
    } else if (ext === 'json') {
      if (this.pkgCache.has(filepath)) {
        data = this.pkgCache.get(filepath)[options.packageKey]
      } else {
        data = this.options.parseJSON<T>(readFileSync(filepath, 'utf8'))
      }
    } else {
      // Don't parse data if it's neither .js nor .json
      // Leave this to user-land
      data = readFileSync(filepath, 'utf8') as T
    }

    return { path: filepath, data }
  }

  clearCache () {
    this.existsCache.clear()
    this.pkgCache.clear()

    return this
  }

  normalizeOptions (opts: Partial<ConfigLoaderOptions>): ConfigLoaderOptions {
    const options = { ...this.options, ...opts } // shadow clone

    options.cwd = resolve(options.cwd)
    options.stopDir = options.stopDir ? resolve(options.stopDir) : parse(options.cwd).root

    if (!options.files || options.files.length === 0) {
      throw new Error('files must be an non-empty array!')
    }

    return options
  }
}

export default new ConfigLoader({
  stopDir: dirname(process.cwd()),
})
