import {
  Plugin, ExternalOption, GlobalsOption, InputOption, InputOptions, OutputOptions,
} from 'rollup'

interface GenericConfigObject {
 [key: string]: unknown;
}

type RollupExternalPredicate = (source: string, importer: string | undefined, isResolved: boolean) => boolean | null | void;

type PluginName = string

type BundlerExternalFunc = (
  id: string,
  importer: string | undefined,
  isResolved: boolean,
  extra: () => boolean | { defaultFn?: () => boolean; format: string; }
) => boolean | null | void

interface BundlerInputOptions extends Omit<InputOptions, 'plugins' | 'external'> {
  /* @override add support with plugin id list */
  plugins?: (PluginName | Plugin)[];

  /* @override with BundlerExternalFunc support */
  external?: ExternalOption | BundlerExternalFunc;

  globals?: GlobalsOption;
}

interface BundlerOutputOptions extends Omit<OutputOptions, 'plugins'> {
  plugins?: (PluginName | Plugin)[];
  output?: Array<OutputOptions & { plugins: (PluginName | Plugin)[]; }>
}

interface BundlerEntry extends BundlerInputOptions {
  output: BundlerOutputOptions[];
}

type PluginOptions<T = Record<string, any>> = {
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
  dependencies?: Kv;

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
