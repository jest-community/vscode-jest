import { TestState } from '../DebugCodeLens'

export interface IPluginSettings {
  autoEnable?: boolean
  debugCodeLens: {
    enabled: boolean
    showWhenTestStateIn: TestState[]
  }
  enableInlineErrorMessages?: boolean
  enableSnapshotPreviews?: boolean
  enableSnapshotUpdateMessages?: boolean
  pathToConfig?: string
  pathToJest?: string
  restartJestOnSnapshotUpdate?: boolean
  rootPath?: string
  runAllTestsFirst?: boolean
  showCoverageOnLoad: boolean
  coverageFormatter: string
}

export function isDefaultPathToJest(str) {
  return str === null || str === ''
}

export function hasUserSetPathToJest(str) {
  return !isDefaultPathToJest(str)
}
