/* eslint-disable no-unused-vars */

import { createConfigItem } from '@babel/core'
import { isEmpty, merge, omit } from '@fdio/utils'
import babelPlugin from 'rollup-plugin-babel'

const isTruthy = isEmpty

const uniq = <T> (list: T[]): T[] => list.reduce((p, o) => {
  if (!~p.indexOf(o)) p.push(o)
  return p
}, [] as T[])

const ESMODULES_TARGET = {
  esmodules: true
}

const mergeConfigItems = (type, ...configItemsToMerge) => {
  const mergedItems = []

  configItemsToMerge.forEach(configItemToMerge => {
    configItemToMerge.forEach(item => {
      const itemToMergeWithIndex = mergedItems.findIndex(
        mergedItem => mergedItem.file.resolved === item.file.resolved
      )

      if (itemToMergeWithIndex === -1) {
        mergedItems.push(item)
        return
      }

      mergedItems[itemToMergeWithIndex] = createConfigItem(
        [
          mergedItems[itemToMergeWithIndex].file.resolved,
          merge(mergedItems[itemToMergeWithIndex].options, item.options)
        ],
        {
          type
        }
      )
    })
  })

  return mergedItems
}

const createConfigItems = (type, items) => {
  return items.map(({ name, ...options }) => {
    return createConfigItem([require.resolve(name), options], { type })
  })
}

export default babelPlugin.custom(babelCore => {
  return {
    // Passed the plugin options.
    options ({ custom: customOptions, ...pluginOptions }) {
      return {
        // Pull out any custom options that the plugin might have.
        customOptions,

        // Pass the options back with the two custom options removed.
        pluginOptions
      }
    },

    config (config, { code, customOptions }) {
      const defaultPlugins = createConfigItems(
        'plugin',
        [
          {
            name: '@babel/plugin-transform-react-jsx',
            pragma: customOptions.pragma || 'h',
            pragmaFrag: customOptions.pragmaFrag || 'Fragment'
          },
          !customOptions.typescript && {
            name: '@babel/plugin-transform-flow-strip-types'
          },
          isTruthy(customOptions.defines) && {
            name: 'babel-plugin-transform-replace-expressions',
            replace: customOptions.defines
          },
          !customOptions.modern && {
            name: 'babel-plugin-transform-async-to-promises',
            inlineHelpers: true,
            externalHelpers: true
          },
          {
            name: '@babel/plugin-proposal-class-properties',
            loose: true
          },
          !customOptions.modern && {
            name: '@babel/plugin-transform-regenerator',
            async: false
          },
          {
            name: 'babel-plugin-macros'
          }
        ].filter(Boolean)
      )

      const babelOptions = config.options || {}

      const envIdx = (babelOptions.presets || []).findIndex(preset =>
        preset.file.request.includes('@babel/preset-env')
      )

      // wrapper for babel preset-env with some builtin features
      if (envIdx !== -1) {
        const preset = babelOptions.presets[envIdx]
        babelOptions.presets[envIdx] = createConfigItem(
          [
            preset.file.resolved,
            Object.assign(
              merge(
                {
                  loose: true,
                  useBuiltIns: false,
                  targets: customOptions.targets
                },
                omit(preset.options, 'exclude'),
                {
                  modules: false,
                  exclude: uniq(['transform-async-to-generator', 'transform-regenerator', ...(preset.options.exclude || [])])
                }
              ),
              customOptions.modern ? { targets: ESMODULES_TARGET } : {}
            )
          ],
          {
            type: `preset`
          }
        )
      } else {
        // merge presets with preset-env
        babelOptions.presets = [
          ...createConfigItems('preset', [
            {
              name: '@babel/preset-env',
              targets: customOptions.modern
                ? ESMODULES_TARGET
                : customOptions.targets,
                modules: false,
                loose: true,
                useBuiltIns: false,
                exclude: ['transform-async-to-generator', 'transform-regenerator']
            }
          ]),
          ...(babelOptions.presets || [])
        ]
      }

      // Merge babelrc & our plugins together
      babelOptions.plugins = mergeConfigItems(
        'plugin',
        defaultPlugins,
        babelOptions.plugins || []
      )

      // @see https://babeljs.io/docs/en/options#generatoropts
      babelOptions.generatorOpts = {
        minified: customOptions.compress,
        compact: customOptions.compress,
        shouldPrintComment: comment => /[@#]__PURE__/.test(comment)
      }

      return babelOptions
    }
  }
})
