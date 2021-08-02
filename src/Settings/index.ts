import { TestState } from '../DebugCodeLens';
import { CoverageColors } from '../Coverage/CoverageOverlay';

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
export interface PluginResourceSettings {
  autoEnable?: boolean;
  enableInlineErrorMessages?: boolean;
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
