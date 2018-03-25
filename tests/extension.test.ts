jest.unmock('../src/extension')

jest.mock('vscode', () => ({
  CodeLens: class {},
  commands: {
    registerCommand: jest.fn(),
    registerTextEditorCommand: jest.fn(),
  },
  debug: {
    registerDebugConfigurationProvider: jest.fn(),
  },
  languages: {
    registerCodeLensProvider: jest.fn(),
  },
  OverviewRulerLane: {},
  StatusBarAlignment: {},
  window: {
    createStatusBarItem: jest.fn().mockReturnValue({ show: jest.fn() }),
    createTextEditorDecorationType: jest.fn(),
    createOutputChannel: jest.fn(),
    onDidChangeActiveTextEditor: jest.fn().mockReturnValue('onDidChangeActiveTextEditor'),
  },
  workspace: {
    getConfiguration: jest.fn().mockReturnValue({
      get: jest.fn().mockImplementation(key => key),
    }),
    onDidChangeConfiguration: jest.fn(),
    onDidCloseTextDocument: jest.fn(),
    onDidChangeTextDocument: jest.fn().mockReturnValue('onDidChangeTextDocument'),
  },
}))

jest.mock('../src/Coverage', () => ({
  registerCoverageCodeLens: jest.fn().mockReturnValue([]),
}))

const jestInstance = {
  onDidChangeActiveTextEditor: {},
  onDidChangeTextDocument: {},
  toggleCoverageOverlay: {},
}
jest.mock('../src/JestExt', () => ({
  JestExt: function() {
    return jestInstance
  },
}))

jest.mock('../src/SnapshotCodeLens', () => ({
  registerSnapshotCodeLens: jest.fn(() => []),
  registerSnapshotPreview: jest.fn(() => []),
}))

import { activate } from '../src/extension'
import * as vscode from 'vscode'

describe('Extension', () => {
  describe('activate()', () => {
    const context: any = {
      subscriptions: {
        push: jest.fn(),
      },
    }
    vscode.workspace.rootPath = 'rootPath'
    const thisArg = jestInstance

    beforeEach(() => {
      context.subscriptions.push.mockReset()
    })

    it('should register an event handler to handle when the editor changes focus', () => {
      const handler = jestInstance.onDidChangeActiveTextEditor
      activate(context)

      expect(vscode.window.onDidChangeActiveTextEditor).toBeCalledWith(handler, thisArg)
      expect(context.subscriptions.push.mock.calls[0]).toContain('onDidChangeActiveTextEditor')
    })

    it('should register an event handler to handle when a document is saved', () => {
      const handler = jestInstance.onDidChangeTextDocument
      activate(context)

      expect(vscode.workspace.onDidChangeTextDocument).toBeCalledWith(handler, thisArg)
      expect(context.subscriptions.push.mock.calls[0]).toContain('onDidChangeTextDocument')
    })

    it('should register a command to toggle the coverage overlay visibility', () => {
      const expected = ['io.orta.jest.coverage.toggle', jestInstance.toggleCoverageOverlay, jestInstance]
      ;(vscode.commands.registerCommand as jest.Mock<any>).mockReturnValue(expected)

      activate(context)

      expect((vscode.commands.registerCommand as jest.Mock<any>).mock.calls).toContainEqual(expected)
      expect(context.subscriptions.push.mock.calls[0]).toContain(expected)
    })
  })
})
