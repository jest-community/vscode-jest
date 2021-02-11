import { TestState } from '../DebugCodeLens';
import { CoverageColors } from '../Coverage/CoverageOverlay';

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
