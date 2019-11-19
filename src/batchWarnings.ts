import chalk from 'chalk'
import { stderr } from './logging'
import { relativeId } from './utils'

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
      const codes = Array.from(allWarnings.keys()).sort((a, b) => allWarnings.get(b).length - allWarnings.get(a).length)
      codes.forEach(code => {
        const warnings = allWarnings.get(code)
        warnings.forEach(warning => {
          stderr(`${chalk.bold.yellow('(!)')} ${chalk.bold.yellow(warning.message)}`)
          if (warning.url) { info(warning.url) }
          const id = (warning.loc && warning.loc.file) || warning.id
          if (id) {
            const loc = warning.loc
              ? relativeId(id) + `: (${warning.loc.line}:${warning.loc.column})`
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
  stderr(`${chalk.bold.yellow('(!)')} ${chalk.bold.yellow(str)}`)
}
function info (url) {
  stderr(chalk.grey(url))
}
