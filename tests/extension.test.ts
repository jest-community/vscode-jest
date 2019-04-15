jest.unmock('../src/extension')

jest.mock('vscode', () => ({
  commands: {
    registerCommand: jest.fn().mockImplementation((...args) => args),
  },
  window: {
    showInformationMessage: jest.fn(),
    onDidChangeActiveTextEditor: jest.fn().mockReturnValue('onDidChangeActiveTextEditor'),
  },
  workspace: {
    getWorkspaceFolder: jest.fn().mockReturnValue({ name: 'workspaceFolder1' }),
    onDidChangeConfiguration: jest.fn().mockReturnValue('onDidChangeConfiguration'),
    onDidCloseTextDocument: jest.fn(),
    onDidChangeTextDocument: jest.fn().mockReturnValue('onDidChangeTextDocument'),
    onDidChangeWorkspaceFolders: jest.fn().mockReturnValue('onDidChangeWorkspaceFolders'),
  },
  languages: {
    registerCodeLensProvider: jest.fn(),
  },
  debug: {
    registerDebugConfigurationProvider: jest.fn(),
  },
}))

const extensionName = 'jest'
jest.mock('../src/appGlobals', () => ({
  extensionName,
}))

const statusBar = {
  registerCommand: jest.fn(),
}
jest.mock('../src/StatusBar', () => ({ statusBar }))

jest.mock('../src/Coverage', () => ({
  registerCoverageCodeLens: jest.fn().mockReturnValue([]),
  CoverageCodeLensProvider: jest.fn().mockReturnValue({}),
}))

jest.mock('../src/SnapshotCodeLens', () => ({
  registerSnapshotCodeLens: jest.fn(() => []),
  registerSnapshotPreview: jest.fn(() => []),
}))

const jestInstance = {
  toggleCoverageOverlay: jest.fn(),
  runTest: jest.fn(),
  startProcess: jest.fn(),
  stopProcess: jest.fn(),
  restartProcess: jest.fn(),
}

const extensionManager = {
  register: jest.fn(),
  getByName: jest.fn().mockReturnValue(jestInstance),
  get: jest.fn().mockReturnValue(jestInstance),
  unregisterAll: jest.fn(),
  registerCommand: jest.fn().mockImplementation((...args) => args),
}

const ExtensionManager = jest.fn().mockImplementation(() => extensionManager)

jest.mock('../src/extensionManager', () => ({
  ExtensionManager,
  getExtensionWindowSettings: jest.fn(() => ({})),
}))

import { activate, deactivate } from '../src/extension'
import * as vscode from 'vscode'

describe('Extension', () => {
  describe('activate()', () => {
    const context: any = {
      subscriptions: {
        push: jest.fn(),
      },
    }

    beforeEach(() => {
      context.subscriptions.push.mockReset()
    })

    it('should instantiate ExtensionManager', () => {
      activate(context)
      expect(ExtensionManager).toHaveBeenCalledTimes(1)
    })

    it('should register statusBar', () => {
      statusBar.registerCommand.mockReset()
      activate(context)
      expect(statusBar.registerCommand).toHaveBeenCalled()
    })

    it('should register an event handler to handle when the editor changes focus', () => {
      activate(context)

      expect(vscode.window.onDidChangeActiveTextEditor).toBeCalled()
      expect(context.subscriptions.push.mock.calls[0]).toContain('onDidChangeActiveTextEditor')
    })

    it('should register an event handler to handle when a document is saved', () => {
      activate(context)

      expect(vscode.workspace.onDidChangeTextDocument).toBeCalled()
      expect(context.subscriptions.push.mock.calls[0]).toContain('onDidChangeTextDocument')
    })

    it('should register an event handler to handle when an extension configuration changed', () => {
      activate(context)

      expect(vscode.workspace.onDidChangeConfiguration).toBeCalled()
      expect(context.subscriptions.push.mock.calls[0]).toContain('onDidChangeConfiguration')
    })

    it('should register an event handler to handle when workspace folders changed', () => {
      activate(context)

      expect(vscode.workspace.onDidChangeWorkspaceFolders).toBeCalled()
      expect(context.subscriptions.push.mock.calls[0]).toContain('onDidChangeWorkspaceFolders')
    })

    describe('should register a command', () => {
      beforeEach(() => {
        jestInstance.toggleCoverageOverlay.mockReset()
        jestInstance.runTest.mockReset()
        jestInstance.startProcess.mockReset()
        jestInstance.stopProcess.mockReset()
        jestInstance.restartProcess.mockReset()
      })

      it('to start extension', () => {
        activate(context)
        const callArg = context.subscriptions.push.mock.calls[0].find(args => {
          return args[0] === `${extensionName}.start`
        })

        expect(callArg).toBeDefined()
        callArg[1](jestInstance)
        expect(jestInstance.startProcess).toHaveBeenCalled()
      })

      it('to stop extension', () => {
        activate(context)
        const callArg = context.subscriptions.push.mock.calls[0].find(args => {
          return args[0] === `${extensionName}.stop`
        })

        expect(callArg).toBeDefined()
        callArg[1](jestInstance)
        expect(jestInstance.stopProcess).toHaveBeenCalled()
      })

      it('to restart extension', () => {
        activate(context)
        const callArg = context.subscriptions.push.mock.calls[0].find(args => {
          return args[0] === `${extensionName}.restart`
        })

        expect(callArg).toBeDefined()
        callArg[1](jestInstance)
        expect(jestInstance.restartProcess).toHaveBeenCalled()
      })

      it('to toggle the coverage overlay visibility', () => {
        activate(context)
        const callArg = context.subscriptions.push.mock.calls[0].find(args => {
          return args[0] === `${extensionName}.coverage.toggle`
        })

        expect(callArg).toBeDefined()
        callArg[1](jestInstance)
        expect(jestInstance.toggleCoverageOverlay).toHaveBeenCalled()
      })

      it('to run specific test', () => {
        activate(context)
        const callArg = context.subscriptions.push.mock.calls[0].find(args => {
          return args[0] === `${extensionName}.run-test`
        })

        expect(callArg).toBeDefined()
        callArg[1]({ uri: '' })
        expect(jestInstance.runTest).toHaveBeenCalled()
      })
    })

    it('should register a DebugConfigurationProvider', () => {
      const register = vscode.debug.registerDebugConfigurationProvider as jest.Mock<any>
      register.mockReset()

      activate(context)

      expect(register).toHaveBeenCalledTimes(2)
      const registeredAsNode = register.mock.calls.some(parameters => parameters[0] === 'node')
      const registeredAsJestTest = register.mock.calls.some(parameters => parameters[0] === 'vscode-jest-tests')
      expect(registeredAsNode && registeredAsJestTest).toBeTruthy()
    })
  })

  describe('deactivate()', () => {
    it('should call unregisterAll on instancesManager', () => {
      deactivate()
      expect(extensionManager.unregisterAll).toBeCalled()
    })
  })
})
