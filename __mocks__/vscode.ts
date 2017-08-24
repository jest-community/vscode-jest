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
}

const OverviewRulerLane = {
  Left: null,
}

export { languages, StatusBarAlignment, window, workspace, OverviewRulerLane }
