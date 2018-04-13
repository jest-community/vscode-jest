export interface CliOptions {
  noColor?: boolean
}

export interface IPluginSettings {
  autoEnable?: boolean
  enableCodeLens?: boolean
  enableInlineErrorMessages?: boolean
  enableSnapshotUpdateMessages?: boolean
  pathToJest?: string
  pathToConfig?: string
  cliOptions: CliOptions
  rootPath?: string
  runAllTestsFirst?: boolean
  showCoverageOnLoad: boolean
}
