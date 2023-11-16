import { RollupWarning } from 'rollup'

import { bold, gray, yellow } from './colors'
import { stderr } from './logging'

import { getOrCreate, printQuotedStringList, relativeId } from '.'

export interface BatchWarnings {
  add: (warning: RollupWarning) => void;
  readonly count: number;
  flush: () => void;
  readonly warningOccurred: boolean;
}

const immediateHandlers: {
  [code: string]: (warning: RollupWarning) => void;
} = {
  MISSING_NODE_BUILTINS (warning) {
    title('Missing shims for Node.js built-ins')

    stderr(
      `Creating a browser bundle that depends on ${printQuotedStringList(
        warning.modules!,
      )}. You might need to include https://github.com/FredKSchott/rollup-plugin-polyfill-node`,
    )
  },

  UNKNOWN_OPTION (warning) {
    title('You have passed an unrecognized option')
    stderr(warning.message)
  },
}

const deferredHandlers: {
  [code: string]: (warnings: RollupWarning[]) => void;
} = {
  CIRCULAR_DEPENDENCY (warnings) {
    title(`Circular dependenc${warnings.length > 1 ? 'ies' : 'y'}`)
    const displayed = warnings.length > 5 ? warnings.slice(0, 3) : warnings
    for (const warning of displayed) {
      stderr(warning.cycle!.join(' -> '))
    }
    if (warnings.length > displayed.length) {
      stderr(`...and ${warnings.length - displayed.length} more`)
    }
  },

  EMPTY_BUNDLE (warnings) {
    title(
      `Generated${warnings.length === 1 ? ' an' : ''} empty ${
        warnings.length > 1 ? 'chunks' : 'chunk'
      }`,
    )
    stderr(warnings.map(warning => warning.chunkName!).join(', '))
  },

  EVAL (warnings) {
    title('Use of eval is strongly discouraged')
    info('https://rollupjs.org/guide/en/#avoiding-eval')
    showTruncatedWarnings(warnings)
  },

  MISSING_EXPORT (warnings) {
    title('Missing exports')
    info('https://rollupjs.org/guide/en/#error-name-is-not-exported-by-module')

    for (const warning of warnings) {
      stderr(bold(warning.importer!))
      stderr(`${warning.missing} is not exported by ${warning.exporter}`)
      stderr(gray(warning.frame!))
    }
  },

  MISSING_GLOBAL_NAME (warnings) {
    title(`Missing global variable ${warnings.length > 1 ? 'names' : 'name'}`)
    stderr(
      'Use output.globals to specify browser global variable names corresponding to external modules',
    )
    for (const warning of warnings) {
      stderr(`${bold(warning.source!)} (guessing '${warning.guess}')`)
    }
  },

  MIXED_EXPORTS (warnings) {
    title('Mixing named and default exports')
    info('https://rollupjs.org/guide/en/#outputexports')
    stderr(bold('The following entry modules are using named and default exports together:'))
    warnings.sort((a, b) => (a.id! < b.id! ? -1 : 1))
    const displayedWarnings = warnings.length > 5 ? warnings.slice(0, 3) : warnings
    for (const warning of displayedWarnings) {
      stderr(relativeId(warning.id!))
    }
    if (displayedWarnings.length < warnings.length) {
      stderr(`...and ${warnings.length - displayedWarnings.length} other entry modules`)
    }
    // eslint-disable-next-line max-len
    stderr('\nConsumers of your bundle will have to use chunk[\'default\'] to access their default export, which may not be what you want. Use `output.exports: \'named\'` to disable this warning')
  },

  NAMESPACE_CONFLICT (warnings) {
    title('Conflicting re-exports')
    for (const warning of warnings) {
      stderr(
        `"${bold(relativeId(warning.reexporter!))}" re-exports "${
          warning.name
        }" from both "${relativeId(warning.sources![0])}" and "${relativeId(
          warning.sources![1],
        )}" (will be ignored)`,
      )
    }
  },

  NON_EXISTENT_EXPORT (warnings) {
    title(`Import of non-existent ${warnings.length > 1 ? 'exports' : 'export'}`)
    showTruncatedWarnings(warnings)
  },

  PLUGIN_WARNING (warnings) {
    const nestedByPlugin = nest(warnings, 'plugin')

    for (const { key: plugin, items } of nestedByPlugin) {
      const nestedByMessage = nest(items, 'message')

      let lastUrl = ''

      for (const { key: message, items } of nestedByMessage) {
        title(`Plugin ${plugin}: ${message}`)
        for (const warning of items) {
          if (warning.url && warning.url !== lastUrl) info((lastUrl = warning.url))

          const id = warning.id || warning.loc?.file
          if (id) {
            let loc = relativeId(id)
            if (warning.loc) {
              loc += `: (${warning.loc.line}:${warning.loc.column})`
            }
            stderr(bold(loc))
          }
          if (warning.frame) info(warning.frame)
        }
      }
    }
  },

  SOURCEMAP_BROKEN (warnings) {
    title('Broken sourcemap')
    info('https://rollupjs.org/guide/en/#warning-sourcemap-is-likely-to-be-incorrect')

    const plugins = [...new Set(warnings.map(({ plugin }) => plugin).filter(Boolean))] as string[]
    stderr(
      `Plugins that transform code (such as ${printQuotedStringList(
        plugins,
      )}) should generate accompanying sourcemaps`,
    )
  },

  THIS_IS_UNDEFINED (warnings) {
    title('`this` has been rewritten to `undefined`')
    info('https://rollupjs.org/guide/en/#error-this-is-undefined')
    showTruncatedWarnings(warnings)
  },

  UNRESOLVED_IMPORT (warnings) {
    title('Unresolved dependencies')
    info('https://rollupjs.org/guide/en/#warning-treating-module-as-external-dependency')

    const dependencies = new Map<string, string[]>()
    for (const warning of warnings) {
      getOrCreate(dependencies, warning.source, () => []).push(warning.importer!)
    }

    for (const [dependency, importers] of dependencies) {
      stderr(`${bold(dependency)} (imported by ${importers.join(', ')})`)
    }
  },

  UNUSED_EXTERNAL_IMPORT (warnings) {
    title('Unused external imports')
    for (const warning of warnings) {
      stderr(
        `${warning.names
        } imported from external module "${
          warning.source
        }" but never used in ${
          printQuotedStringList(warning.sources!.map(id => relativeId(id)))}`,
      )
    }
  },
}

function title (str: string): void {
  stderr(bold(yellow(`(!) ${str}`)))
}

function info (url: string): void {
  stderr(gray(url))
}

interface Nested<T> {
  items: T[];
  key: string;
}

function nest<T extends Record<string, any>> (array: readonly T[], prop: string): Nested<T>[] {
  const nested: Nested<T>[] = []
  const lookup = new Map<string, Nested<T>>()

  for (const item of array) {
    const key = item[prop]
    getOrCreate(lookup, key, () => {
      const items = {
        items: [],
        key,
      }
      nested.push(items)
      return items
    }).items.push(item)
  }

  return nested
}

function showTruncatedWarnings (warnings: readonly RollupWarning[]): void {
  const nestedByModule = nest(warnings, 'id')

  const displayedByModule = nestedByModule.length > 5 ? nestedByModule.slice(0, 3) : nestedByModule
  for (const { key: id, items } of displayedByModule) {
    stderr(bold(relativeId(id)))
    stderr(gray(items[0].frame!))

    if (items.length > 1) {
      stderr(`...and ${items.length - 1} other ${items.length > 2 ? 'occurrences' : 'occurrence'}`)
    }
  }

  if (nestedByModule.length > displayedByModule.length) {
    stderr(`\n...and ${nestedByModule.length - displayedByModule.length} other files`)
  }
}

export default function batchWarnings (): BatchWarnings {
  let count = 0
  const deferredWarnings = new Map<keyof typeof deferredHandlers, RollupWarning[]>()
  let warningOccurred = false

  return {
    add (warning: RollupWarning) {
      count += 1
      warningOccurred = true

      if (warning.code! in deferredHandlers) {
        getOrCreate(deferredWarnings, warning.code!, () => []).push(warning)
      } else if (warning.code! in immediateHandlers) {
        immediateHandlers[warning.code!](warning)
      } else {
        title(warning.message)

        if (warning.url) info(warning.url)

        const id = (warning.loc && warning.loc.file) || warning.id
        if (id) {
          const loc = warning.loc
            ? `${relativeId(id)} (${warning.loc.line}:${warning.loc.column})`
            : relativeId(id)

          stderr(bold(relativeId(loc)))
        }

        if (warning.frame) info(warning.frame)
      }
    },

    get count () {
      return count
    },

    flush () {
      if (count === 0) return

      const codes = Array.from(deferredWarnings.keys()).sort(
        (a, b) => deferredWarnings.get(b)!.length - deferredWarnings.get(a)!.length,
      )

      for (const code of codes) {
        deferredHandlers[code](deferredWarnings.get(code)!)
      }

      deferredWarnings.clear()
      count = 0
    },

    get warningOccurred () {
      return warningOccurred
    },
  }
}
