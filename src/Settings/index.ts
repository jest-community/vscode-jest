import { TestState } from '../DebugCodeLens'

export interface IPluginResourceSettings {
  autoEnable?: boolean
  enableInlineErrorMessages?: boolean
  enableSnapshotUpdateMessages?: boolean
  pathToConfig?: string
  pathToJest?: string
  restartJestOnSnapshotUpdate?: boolean
  rootPath?: string
  runAllTestsFirst?: boolean
  showCoverageOnLoad: boolean
  coverageFormatter: string
  debugMode?: boolean
}

export interface IPluginWindowSettings {
  debugCodeLens: {
    enabled: boolean
    showWhenTestStateIn: TestState[]
  }
  enableSnapshotPreviews?: boolean
  disabledWorkspaceFolders: string[]
}

export function isDefaultPathToJest(str) {
  return str === null || str === ''
}

export function hasUserSetPathToJest(str) {
  return !isDefaultPathToJest(str)
}
