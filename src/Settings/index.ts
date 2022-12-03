import { CoverageColors } from '../Coverage/CoverageOverlay';
import { ProjectWorkspace } from 'jest-editor-support';
import { AutoRun } from '../JestExt/auto-run';
import { RunShell } from '../JestExt/run-shell';

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

export type TestExplorerConfigLegacy =
  | { enabled: false }
  | { enabled: true; showClassicStatus?: boolean; showInlineError?: boolean };

export interface TestExplorerConfig {
  showInlineError?: boolean;
}

export type NodeEnv = ProjectWorkspace['nodeEnv'];
export type MonitorLongRun = 'off' | number;
export interface PluginResourceSettings {
  jestCommandLine?: string;
  rootPath: string;
  showCoverageOnLoad: boolean;
  coverageFormatter: string;
  debugMode?: boolean;
  coverageColors?: CoverageColors;
  autoRun: AutoRun;
  testExplorer: TestExplorerConfig;
  nodeEnv?: NodeEnv;
  shell: RunShell;
  monitorLongRun?: MonitorLongRun;
}

export interface PluginWindowSettings {
  disabledWorkspaceFolders: string[];
}
