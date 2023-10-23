import { CoverageColors } from '../Coverage/CoverageOverlay';
import { JESParserPluginOptions, ProjectWorkspace } from 'jest-editor-support';
import { RunShell } from '../JestExt/run-shell';
import { RunMode } from '../JestExt/run-mode';

export type JestTestProcessType =
  | 'all-tests'
  | 'watch-tests'
  | 'watch-all-tests'
  | 'by-file'
  | 'by-file-test'
  | 'not-test'
  | 'by-file-test-pattern'
  | 'by-file-pattern';

export type OnStartupType = Extract<JestTestProcessType, 'all-tests'>[];
export type OnSaveFileType = 'test-file' | 'test-src-file';
export type JestExtAutoRunShortHand = 'default' | 'watch' | 'on-save' | 'legacy' | 'off';

export type JestExtAutoRunConfig =
  | { watch: true; onStartup?: OnStartupType }
  | {
      watch: false;
      onStartup?: OnStartupType;
      onSave?: OnSaveFileType;
    };
export type JestExtAutoRunSetting = JestExtAutoRunShortHand | JestExtAutoRunConfig;

export interface JestRunModeOptions {
  runAllTestsOnStartup?: boolean;
  coverage?: boolean;
  deferred?: boolean;

  // TestExplorer related settings
  showInlineError?: boolean;
}
export type JestRunMode = (
  | { type: 'watch' }
  | { type: 'on-demand' }
  | { type: 'on-save'; testFileOnly?: boolean }
) &
  JestRunModeOptions;

export type JestRunModeType = JestRunMode['type'];
export type JestPredefinedRunModeType = JestRunModeType | 'deferred';
export type JestRunModeSetting = JestRunMode | JestPredefinedRunModeType;

export interface JestOutputSetting {
  revealWithFocus?: 'terminal' | 'test-results' | 'none';
  revalOn?: 'run' | 'error' | 'demand';
  clearOnRun?: 'both' | 'terminal' | 'test-results' | 'none';
}

export type TestExplorerConfigLegacy =
  | { enabled: false }
  | { enabled: true; showClassicStatus?: boolean; showInlineError?: boolean };

export interface TestExplorerConfig {
  showInlineError?: boolean;
}

export type NodeEnv = ProjectWorkspace['nodeEnv'];
export type MonitorLongRun = 'off' | number;
export type AutoRevealOutputType = 'on-run' | 'on-exec-error' | 'off';
export interface PluginResourceSettings {
  jestCommandLine?: string;
  rootPath: string;
  coverageFormatter: string;
  debugMode?: boolean;
  coverageColors?: CoverageColors;
  runMode: RunMode;
  nodeEnv?: NodeEnv;
  shell: RunShell;
  monitorLongRun?: MonitorLongRun;
  enable?: boolean;
  parserPluginOptions?: JESParserPluginOptions;
  useDashedArgs?: boolean;
}

export interface DeprecatedPluginResourceSettings {
  showCoverageOnLoad?: boolean;
  autoRevealOutput?: AutoRevealOutputType;
  autoRun?: JestExtAutoRunSetting | null;
  testExplorer?: TestExplorerConfig;
  autoClearTerminal?: boolean;
}

export interface PluginWindowSettings {
  disabledWorkspaceFolders: string[];
}

export type AllPluginResourceSettings = PluginResourceSettings & DeprecatedPluginResourceSettings;

export type VirtualFolderSettingKey = keyof AllPluginResourceSettings;
export interface VirtualFolderSettings extends AllPluginResourceSettings {
  name: string;
}

export type GetConfigFunction = <T>(key: VirtualFolderSettingKey) => T | undefined;
