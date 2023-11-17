import {
  ExternalOption, GlobalsOption, InputOption, InputOptions, OutputOptions, OutputPlugin, PluginHooks, PluginImpl,
} from 'rollup'

interface GenericConfigObject {
 [key: string]: unknown;
}

type RollupExternalPredicate = (source: string, importer: string | undefined, isResolved: boolean) => boolean | null | void;

interface Plugin extends OutputPlugin, Partial<PluginHooks> {
  // for inter-plugin communication
  api?: any;
}

type PluginName = string

type GenericPluginOptions = Record<string, unknown>

type BundlerExternalFunc = (
  id: string,
  importer: string | undefined,
  isResolved: boolean,
  extra: () => boolean | { defaultFn?: () => boolean; format: string; }
) => boolean | null | void

type PluginWithOptions = [
  /** plugin name or plugin instance */
  PluginName | Plugin | PluginImpl,
  /** plugin options */
  GenericPluginOptions
]

interface BundlerInputOptions extends Omit<InputOptions, 'plugins' | 'external'> {
  /* @override add support with plugin id list */
  plugins?: (PluginName | Plugin)[];

  /* @override with BundlerExternalFunc support */
  external?: ExternalOption | BundlerExternalFunc;

  globals?: GlobalsOption;
}

interface BundlerOutputOptions extends Omit<OutputOptions, 'plugins'> {
  plugins?: (PluginName | Plugin | PluginImpl | PluginWithOptions)[];
  /**
   * Turn on/off minimize plugin or shortcut config for minimize plugin options:
   * ```
   * [1, { format: { beautify: true }, ... }]
   * ```
   */
  minimize?: boolean | [0 | 1, GenericPluginOptions];
}

interface BundlerEntry extends BundlerInputOptions {
  output: BundlerOutputOptions[];
}

type PluginOptions<T = GenericPluginOptions> = {
  [plugin: string]: T | (() => T)
}

interface PluginContext {
  input: InputOption;
  output: BundlerOutputOptions;
  options: NormalizedBundlerOptions;
}

interface BundlerOptions {
  /**
   * project root dir, base dir for output `dir`, `file` being resolved. default to './'
   */
  rootDir?: string;

  /**
   * Default destribute output root. default to './lib'
   */
  destDir?: string;

  entry?: BundlerEntry | BundlerEntry[];

  // common plugin options
  plugins?: PluginOptions;

  /**
   * default whitlist for external iniital
   */
  dependencies?: string[] | Kv;

  /**
   * Parse <project>/package.json #dependencies, #peerDependencies as external, defaults to `true`
   */
  parsePackageDepsAsExternal?: boolean;

  /** @deprecated Use `minimize` instead */
  compress?: boolean;
  minimize?: boolean;

  sourcemap?: boolean;

  jsx?: string;
  jsxFragment?: string;
  target?: 'web' | 'node';
  vue?: boolean;
  react?: boolean;
  jsxImportSource?: boolean;
  defines?: Record<string, any>;
  autoTsconfig?: boolean;
}

interface NormalizedBundlerOptions extends BundlerOptions {
  entry: BundlerEntry[];
}
