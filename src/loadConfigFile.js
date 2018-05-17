import path from 'path'
import rollup from 'rollup'
import chalk from 'chalk'

const absolutePath = /^(?:\/|(?:[A-Za-z]:)?[\\|/])/
function isAbsolute (p) {
  return absolutePath.test(p)
}

function relativeId (id) {
  if (typeof process === 'undefined' || !isAbsolute(id)) { return id }
  return path.relative(process.cwd(), id)
}

if (!chalk.supportsColor) { chalk.enabled = false }

// log to stderr to keep `rollup main.js > bundle.js` from breaking
const stderr = console.error.bind(console) // eslint-disable-line no-console

export default function loadConfigFile (configFile, commandOptions = {}) {
  let silent = commandOptions.silent || false
  let warnings = batchWarnings()
  return rollup
    .rollup({
      input: configFile,
      external: function (id) {
        return (id[0] !== '.' && !path.isAbsolute(id)) || id.slice(-5, id.length) === '.json'
      },
      onwarn: warnings.add
    })
    .then(function (bundle) {
      if (!silent && warnings.count > 0) {
        stderr(chalk.bold('loaded ' + relativeId(configFile) + ' with warnings'))
        warnings.flush()
      }
      return bundle.generate({ format: 'cjs' })
    })
    .then(function ({ code }) {
      // temporarily override require
      let defaultLoader = require.extensions['.js'] // eslint-disable-line
      require.extensions['.js'] = function (module, filename) { // eslint-disable-line
        if (filename === configFile) {
          module._compile(code, filename)
        } else {
          defaultLoader(module, filename)
        }
      }
      delete require.cache[configFile]
      return Promise.resolve(require(configFile))
        .then(function (configFileContent) {
          if (typeof configFileContent === 'function') {
            return configFileContent(commandOptions)
          }
          return configFileContent
        })
        .then(function (configs) {
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

function handleError (err, recover) {
  if (recover === void 0) { recover = false }
  let description = err.message || err
  if (err.name) { description = err.name + ': ' + description }
  let message = (err.plugin
    ? '(' + err.plugin + ' plugin) ' + description
    : description) || err
  stderr(chalk.bold.red('[!] ' + chalk.bold(message.toString())))
  // TODO should this be "err.url || (err.file && err.loc.file) || err.id"?
  if (err.url) {
    stderr(chalk.cyan(err.url))
  }
  if (err.loc) {
    stderr(relativeId(err.loc.file || err.id) + ' (' + err.loc.line + ':' + err.loc.column + ')')
  } else if (err.id) {
    stderr(relativeId(err.id))
  }
  if (err.frame) {
    stderr(chalk.dim(err.frame))
  } else if (err.stack) {
    stderr(chalk.dim(err.stack))
  }
  stderr('')
  if (!recover) { process.exit(1) }
}

function batchWarnings () {
  let allWarnings = new Map()
  let count = 0
  return {
    get count () {
      return count
    },
    add (warning) {
      if (typeof warning === 'string') {
        warning = { code: 'UNKNOWN', message: warning }
      }
      if (!allWarnings.has(warning.code)) { allWarnings.set(warning.code, []) }
      allWarnings.get(warning.code).push(warning)
      count += 1
    },
    flush () {
      if (count === 0) { return }
      let codes = Array.from(allWarnings.keys()).sort(function (a, b) {
        return allWarnings.get(b).length - allWarnings.get(a).length
      })
      codes.forEach(code => {
        let warnings = allWarnings.get(code)
        warnings.forEach(warning => {
          stderr(chalk.bold.yellow('(!)') + ' ' + chalk.bold.yellow(warning.message))
          if (warning.url) { info(warning.url) }
          let id = (warning.loc && warning.loc.file) || warning.id
          if (id) {
            let loc = warning.loc
              ? relativeId(id) + ': (' + warning.loc.line + ':' + warning.loc.column + ')'
              : relativeId(id)
            stderr(chalk.bold(relativeId(loc)))
          }
          if (warning.frame) { info(warning.frame) }
        })
      })
      allWarnings = new Map()
      count = 0
    }
  }
}

// eslint-disable-next-line
function title (str) {
  stderr(chalk.bold.yellow('(!)') + ' ' + chalk.bold.yellow(str))
}
function info (url) {
  stderr(chalk.grey(url))
}
