import { isEmpty, merge } from '@fdio/utils'
import { createBabelInputPluginFactory } from '@rollup/plugin-babel'

import { resolveModule } from '../utils'

import transformFastRest from './transform-fast-rest'

const isTruthy = v =>
  !isEmpty(v)

const ESMODULES_TARGET = {
  esmodules: true,
}

const mergeConfigItems = (babel, type, ...configItemsToMerge) => {
  const mergedItems = []

  configItemsToMerge.forEach(configItemToMerge => {
    configItemToMerge.forEach(item => {
      const itemToMergeWithIndex = mergedItems.findIndex(
        mergedItem =>
          (mergedItem.name || mergedItem.file.resolved)
          === (item.name || item.file.resolved),
      )

      if (itemToMergeWithIndex === -1) {
        mergedItems.push(item)
        return
      }

      mergedItems[itemToMergeWithIndex] = babel.createConfigItem(
        [
          mergedItems[itemToMergeWithIndex].file.resolved,
          merge(mergedItems[itemToMergeWithIndex].options, item.options),
        ],
        {
          type,
        },
      )
    })
  })

  return mergedItems
}

const createConfigItems = (babel, type, items) =>
  items.map(item => {
    const { name, value, ...options } = item
    const v = value || [resolveModule(name), options]
    return babel.createConfigItem(v, { type })
  })

const environmentPreset = '@babel/preset-env'
// capture both @babel/env & @babel/preset-env (https://babeljs.io/docs/en/presets#preset-shorthand)
const presetEnvRegex = /@babel\/(preset-)?env/

export default () =>
  createBabelInputPluginFactory(babelCore =>
    ({
      // Passed the plugin options.
      options ({ custom: customOptions, ...pluginOptions }) {
        return {
          // Pull out any custom options that the plugin might have.
          customOptions,

          // Pass the options back with the two custom options removed.
          pluginOptions,
        }
      },

      config (config, { customOptions }) {
        const targets = customOptions.targets
        const isNodeTarget = targets?.node != null

        const defaultPlugins = createConfigItems(
          babelCore,
          'plugin',
          [
            {
              name: '@babel/plugin-syntax-import-meta',
            },
            !customOptions.jsxImportSource && !customOptions.vue
              && {
                name: '@babel/plugin-transform-react-jsx',
                pragma: customOptions.pragma || 'h',
                pragmaFrag: customOptions.pragmaFrag || 'Fragment',
              },
            !customOptions.typescript
              && {
                name: '@babel/plugin-transform-flow-strip-types',
              },
            isTruthy(customOptions.defines)
              && {
                name: 'babel-plugin-transform-replace-expressions',
                replace: customOptions.defines,
              },
            !customOptions.modern && !isNodeTarget
              && {
                name: 'babel-plugin-transform-async-to-promises',
                inlineHelpers: true,
                externalHelpers: false,
                minify: true,
              },
            !customOptions.modern && !isNodeTarget
              && {
                value: [
                  transformFastRest,
                  {
                    // Use inline [].slice.call(arguments)
                    helper: false,
                    literal: true,
                  },
                  'transform-fast-rest',
                ],
              },
            !customOptions.modern && !isNodeTarget
              && {
                name: '@babel/plugin-transform-regenerator',
                async: false,
              },
            {
              name: 'babel-plugin-macros',
            },
          ].filter(Boolean),
        )

        const babelOptions = config.options || {}

        const envIdx = (babelOptions.presets || []).findIndex(preset =>
          presetEnvRegex.test(preset.file.request))

        // wrapper for babel preset-env with some builtin features
        if (envIdx !== -1) {
          const preset = babelOptions.presets[envIdx]
          babelOptions.presets[envIdx] = babelCore.createConfigItem(
            [
              resolveModule(environmentPreset),
              Object.assign(
                merge(
                  {
                    loose: true,
                    useBuiltIns: false,
                    targets: customOptions.targets,
                  },
                  preset.options,
                  {
                    bugfixes: customOptions.modern,
                    modules: false,
                    exclude: merge(
                      ['transform-async-to-generator', 'transform-regenerator'],
                      preset.options?.exclude || [],
                    ),
                  },
                ),
                customOptions.modern ? { targets: ESMODULES_TARGET } : {},
              ),
            ],
            {
              type: 'preset',
            },
          )
        } else {
          babelOptions.presets = createConfigItems(
            babelCore,
            'preset',
            [
              {
                name: environmentPreset,
                targets: customOptions.modern
                  ? ESMODULES_TARGET
                  : customOptions.targets,
                modules: false,
                loose: true,
                useBuiltIns: false,
                bugfixes: customOptions.modern,
                exclude: ['transform-async-to-generator', 'transform-regenerator'],
              },
              customOptions.jsxImportSource && {
                name: '@babel/preset-react',
                runtime: 'automatic',
                importSource: customOptions.jsxImportSource,
              },
            ].filter(Boolean),
          )
        }

        if (customOptions.vue) {
          babelOptions.presets.push(
            ...createConfigItems(
              babelCore,
              'presets',
              [
                { name: '@vue/babel-preset-jsx' },
              ],
            ),
          )
        }

        // Merge babelrc & our plugins together
        babelOptions.plugins = mergeConfigItems(
          babelCore,
          'plugin',
          defaultPlugins,
          babelOptions.plugins || [],
        )

        // @see https://babeljs.io/docs/en/options#generatoropts
        if (customOptions.compress) {
          babelOptions.generatorOpts = {
            minified: true,
            compact: true,
            shouldPrintComment: comment =>
              /[@#]__[A-Z]+__/.test(comment),
          }
        }

        return babelOptions
      },
    }))
