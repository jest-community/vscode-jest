export interface IPluginSettings {
  autoEnable?: boolean
  enableCodeLens?: boolean
  enableInlineErrorMessages?: boolean
  enableSnapshotPreviews?: boolean
  enableSnapshotUpdateMessages?: boolean
  pathToJest?: string
  pathToConfig?: string
  rootPath?: string
  runAllTestsFirst?: boolean
  showCoverageOnLoad: boolean
  restartJestOnSnapshotUpdate?: boolean
}
