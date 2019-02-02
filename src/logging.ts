import chalk from 'chalk'
import { relativeId } from './utils'

if (!chalk.supportsColor) chalk.enabled = false

// log to stderr to keep `rollup main.js > bundle.js` from breaking
export const stderr = console.error.bind(console) // eslint-disable-line no-console

export function stderrln(msg: string) {
  process.stderr.write(msg);
  process.stderr.write('\n');
}

export function handleError (err, recover) {
  if (recover === void 0) { recover = false }
  let description = err.message || err
  if (err.name) { description = err.name + ': ' + description }
  const message = (err.plugin
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
