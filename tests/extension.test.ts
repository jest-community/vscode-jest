jest.unmock('../src/extension')

const vscodeProperties = {
  workspace: {
    rootPath: jest.fn(),
  },
}
jest.mock('vscode', () => {
  const vscode = {
    CodeLens: class {},
    commands: {
      registerCommand: jest.fn(),
      registerTextEditorCommand: jest.fn(),
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
  }

  Object.defineProperty(vscode.workspace, 'rootPath', {
    get: () => vscodeProperties.workspace.rootPath(),
  })

  return vscode
})

jest.mock('../src/Coverage', () => ({
  registerCoverageCodeLens: jest.fn().mockReturnValue([]),
  registerToggleCoverageOverlay: jest.fn(),
}))

const jestInstance = {
  onDidChangeActiveTextEditor: {},
  onDidChangeTextDocument: {},
}
jest.mock('../src/JestExt', () => ({
  JestExt: function() {
    return jestInstance
  },
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
    vscodeProperties.workspace.rootPath.mockReturnValue('rootPath')
    const thisArg = jestInstance

    it('should register an event handler to handle when the editor changes focus', () => {
      const handler = jestInstance.onDidChangeActiveTextEditor
      activate(context)

      expect(vscode.window.onDidChangeActiveTextEditor).toBeCalledWith(handler, thisArg)
      expect(context.subscriptions.push).toBeCalled()
      expect(context.subscriptions.push.mock.calls[0]).toContain('onDidChangeActiveTextEditor')
    })

    it('should register an event handler to handle when a document is saved', () => {
      const handler = jestInstance.onDidChangeTextDocument
      activate(context)

      expect(vscode.workspace.onDidChangeTextDocument).toBeCalledWith(handler, thisArg)
      expect(context.subscriptions.push).toBeCalled()
      expect(context.subscriptions.push.mock.calls[0]).toContain('onDidChangeTextDocument')
    })
  })
})
