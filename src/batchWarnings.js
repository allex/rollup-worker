import chalk from 'chalk'
import { relativeId } from './utils'
import { stderr } from './logging'

export default function batchWarnings () {
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
