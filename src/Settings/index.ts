import { TestState } from '../DebugCodeLens'

export interface IGutterFormatterSettings {
  uncoveredLine: {
    backgroundColor: string
    gutterIconPath: string
  }
  partiallyCoveredLine: {
    backgroundColor: string
    gutterIconPath: string
  }
  coveredLine: {
    backgroundColor: string
    gutterIconPath: string
  }
}

export interface ICoverageFormatterSettings {
  gutterFormatter: IGutterFormatterSettings
}

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
  coverageFormatterSettings: ICoverageFormatterSettings
  debugMode?: boolean
}

export function isDefaultPathToJest(str) {
  return str === null || str === ''
}

export function hasUserSetPathToJest(str) {
  return !isDefaultPathToJest(str)
}
