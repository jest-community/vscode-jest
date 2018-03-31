const languages = {
  createDiagnosticCollection: jest.fn(),
}

const StatusBarAlignment = {}

const window = {
  createStatusBarItem: jest.fn(() => ({
    show: jest.fn(),
  })),
  showErrorMessage: jest.fn(),
  createTextEditorDecorationType: jest.fn(),
}

const workspace = {
  getConfiguration: jest.fn(),
  workspaceFolders: jest.fn(),
}

const OverviewRulerLane = {
  Left: null,
}

const Uri = { file: f => f }
const Range = jest.fn()
const Diagnostic = jest.fn()
const DiagnosticSeverity = { Error: 0, Warning: 1, Information: 2, Hint: 3 }

const debug = {
  onDidTerminateDebugSession: jest.fn(),
  startDebugging: jest.fn(async (_folder: any, nameOrConfig: any) => {
    if (typeof nameOrConfig === 'string') {
      throw null
    }
  }),
}

export {
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
}
