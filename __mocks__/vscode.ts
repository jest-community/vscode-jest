const languages = {
  createDiagnosticCollection: jest.fn(),
  registerCodeLensProvider: jest.fn(),
}

const StatusBarAlignment = { Left: 1, Right: 2 }

const window = {
  createStatusBarItem: jest.fn(() => ({
    show: jest.fn(),
    tooltip: jest.fn(),
  })),
  showErrorMessage: jest.fn(),
  showWarningMessage: jest.fn(),
  createTextEditorDecorationType: jest.fn(),
  createOutputChannel: jest.fn(),
  showWorkspaceFolderPick: jest.fn(),
  onDidChangeActiveTextEditor: jest.fn(),
  showInformationMessage: jest.fn(),
}

const workspace = {
  getConfiguration: jest.fn(),
  workspaceFolders: [],
  getWorkspaceFolder: jest.fn(),

  onDidChangeConfiguration: jest.fn(),
  onDidChangeTextDocument: jest.fn(),
  onDidChangeWorkspaceFolders: jest.fn(),
}

const OverviewRulerLane = {
  Left: null,
}

const Uri = {
  file: (f) => f,
  parse: jest.fn(),
}
const Range = jest.fn()
const Diagnostic = jest.fn()
const DiagnosticSeverity = { Error: 0, Warning: 1, Information: 2, Hint: 3 }

const debug = {
  onDidTerminateDebugSession: jest.fn(),
  startDebugging: jest.fn(),
  registerDebugConfigurationProvider: jest.fn(),
}

const commands = {
  executeCommand: jest.fn(),
  registerCommand: jest.fn(),
}

const CodeLens = function CodeLens() {}

export {
  CodeLens,
  languages,
  StatusBarAlignment,
  window,
  workspace,
  OverviewRulerLane,
  Uri,
  Range,
  Diagnostic,
  DiagnosticSeverity,
  debug,
  commands,
}
