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
    /** Mock getConfiguration by reading default values from package.json */
    getConfiguration: jest.fn().mockImplementation(section => {
      const data = readFileSync('./package.json')
      const config = JSON.parse(data.toString()).contributes.configuration.properties

      const defaults = {}
      for (const key of Object.keys(config)) {
        if (section.length === 0 || key.startsWith(`${section}.`)) {
          defaults[key] = config[key].default
        }
      }

      return {
        get: jest.fn().mockImplementation(key => defaults[`${section}.${key}`]),
      }
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

import { activate, getExtensionSettings } from '../src/extension'
import * as vscode from 'vscode'
import { readFileSync } from 'fs'
import { TestState } from '../src/DebugCodeLens'

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

  describe('getExtensionSettings()', () => {
    it('should return the extension configuration', async () => {
      vscode.workspace.rootPath = '<rootDir>'

      expect(getExtensionSettings()).toEqual({
        autoEnable: true,
        debugCodeLens: {
          enabled: true,
          showWhenTestStateIn: [TestState.Fail, TestState.Unknown],
        },
        enableInlineErrorMessages: true,
        enableSnapshotPreviews: true,
        enableSnapshotUpdateMessages: true,
        pathToConfig: '',
        pathToJest: null,
        restartJestOnSnapshotUpdate: false,
        rootPath: '<rootDir>',
        runAllTestsFirst: true,
        showCoverageOnLoad: false,
      })
    })
  })
})
