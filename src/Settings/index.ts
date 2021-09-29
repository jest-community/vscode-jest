import { TestState } from '../DebugCodeLens';
import { CoverageColors } from '../Coverage/CoverageOverlay';
import { ProjectWorkspace } from 'jest-editor-support';

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
export type JestExtAutoRunConfig =
  | 'off'
  | { watch: true; onStartup?: OnStartupType }
  | {
      watch: false;
      onStartup?: OnStartupType;
      onSave?: OnSaveFileType;
    };

export type TestExplorerConfig =
  | { enabled: false }
  | { enabled: true; showClassicStatus?: boolean; showInlineError?: boolean };
export type NodeEnv = ProjectWorkspace['nodeEnv'];
export interface PluginResourceSettings {
  autoEnable?: boolean;
  enableSnapshotUpdateMessages?: boolean;
  jestCommandLine?: string;
  pathToConfig?: string;
  pathToJest?: string;
  restartJestOnSnapshotUpdate?: boolean;
  rootPath: string;
  runAllTestsFirst?: boolean;
  showCoverageOnLoad: boolean;
  coverageFormatter: string;
  debugMode?: boolean;
  coverageColors?: CoverageColors;
  autoRun?: JestExtAutoRunConfig;
  testExplorer: TestExplorerConfig;
  nodeEnv?: NodeEnv;
  shell?: string;
}

export interface PluginWindowSettings {
  debugCodeLens: {
    enabled: boolean;
    showWhenTestStateIn: TestState[];
  };
  enableSnapshotPreviews?: boolean;
  disabledWorkspaceFolders: string[];
}

export function isDefaultPathToJest(str?: string | null): boolean {
  return str === null || str === '';
}

export function hasUserSetPathToJest(str?: string | null): boolean {
  return !isDefaultPathToJest(str);
}
