import { PluginImpl } from 'rollup'

import { loadModule } from '../utils'
import customBabel from './babel-custom'

interface PluginSpec {
  name?: string;
  impl: () => PluginImpl;
}

export const builtinPlugins: Kv<PluginSpec> = {
  babel: {
    impl: () => customBabel()
  },
  globals: {
    impl: () => loadModule('@allex/rollup-plugin-node-globals')
  },
  minimize: {
    impl: () => loadModule('rollup-plugin-minimize')
  },
  resolve: {
    impl: () => loadModule('@rollup/plugin-node-resolve').nodeResolve
  },
  json: {
    impl: () => loadModule('rollup-plugin-json5')
  },
  typescript: {
    impl: () => loadModule('@rollup/plugin-typescript')
  }
}
