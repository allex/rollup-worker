import { RollupError } from 'rollup'
import { bold, cyan, dim, red } from '../utils/colors'

import { relativeId } from './'

// log to stderr to keep `rollup main.js > bundle.js` from breaking
export const stderr = (...args: readonly unknown[]) => process.stderr.write(`${args.join('')}\n`)

export function handleError (err: RollupError, recover = false): void {
  let description = err.message || err
  if (err.name) description = `${err.name}: ${description}`
  const message = (err.plugin ? `(plugin ${err.plugin}) ${description}` : description) || err

  stderr(bold(red(`[!] ${bold(message.toString())}`)))

  if (err.url) {
    stderr(cyan(err.url))
  }

  if (err.loc) {
    stderr(`${relativeId((err.loc.file || err.id)!)} (${err.loc.line}:${err.loc.column})`)
  } else if (err.id) {
    stderr(relativeId(err.id))
  }

  if (err.frame) {
    stderr(dim(err.frame))
  }

  if (err.stack) {
    stderr(dim(err.stack))
  }

  stderr('')

  if (!recover) process.exit(1)
}
