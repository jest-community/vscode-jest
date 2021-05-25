jest.unmock('../src/extension');

const extensionName = 'jest';
jest.mock('../src/appGlobals', () => ({
  extensionName,
}));

const statusBar = {
  register: jest.fn(() => []),
};
jest.mock('../src/StatusBar', () => ({ statusBar }));

jest.mock('../src/Coverage', () => ({
  registerCoverageCodeLens: jest.fn().mockReturnValue([]),
  CoverageCodeLensProvider: jest.fn().mockReturnValue({}),
}));

jest.mock('../src/SnapshotCodeLens', () => ({
  registerSnapshotCodeLens: jest.fn(() => []),
  registerSnapshotPreview: jest.fn(() => []),
}));

const jestInstance = {
  toggleCoverageOverlay: jest.fn(),
  debugTests: jest.fn(),
  startSession: jest.fn(),
  stopSession: jest.fn(),
  runAllTests: jest.fn(),
};

const extensionManager = {
  register: jest.fn(),
  getByName: jest.fn().mockReturnValue(jestInstance),
  get: jest.fn().mockReturnValue(jestInstance),
  unregisterAll: jest.fn(),
  registerCommand: jest.fn().mockImplementation((args) => args),
  activate: jest.fn(),
};

// tslint:disable-next-line: variable-name
const ExtensionManager = jest.fn();

jest.mock('../src/extensionManager', () => ({
  ExtensionManager,
  getExtensionWindowSettings: jest.fn(() => ({})),
}));

import * as vscode from 'vscode';
import { activate, deactivate } from '../src/extension';
import { startWizard } from '../src/setup-wizard';

(vscode.commands as any).registerCommand = jest.fn().mockImplementation((...args) => args);
(vscode.window as any).onDidChangeActiveTextEditor = jest
  .fn()
  .mockReturnValue('onDidChangeActiveTextEditor');
vscode.workspace.getWorkspaceFolder = jest.fn().mockReturnValue({ name: 'workspaceFolder1' });
(vscode.workspace as any).onDidChangeConfiguration = jest
  .fn()
  .mockReturnValue('onDidChangeConfiguration');
(vscode.workspace as any).onDidChangeTextDocument = jest
  .fn()
  .mockReturnValue('onDidChangeTextDocument');
(vscode.workspace as any).onDidChangeWorkspaceFolders = jest
  .fn()
  .mockReturnValue('onDidChangeWorkspaceFolders');
(vscode.workspace as any).onDidCloseTextDocument = jest
  .fn()
  .mockReturnValue('onDidCloseTextDocument');

describe('Extension', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    ExtensionManager.mockImplementation(() => extensionManager);
  });
  describe('activate()', () => {
    const context: any = {
      subscriptions: {
        push: jest.fn(),
      },
    };

    beforeEach(() => {
      context.subscriptions.push.mockReset();
    });

    it('should instantiate ExtensionManager', () => {
      activate(context);
      expect(ExtensionManager).toHaveBeenCalledTimes(1);
    });

    it('should register statusBar', () => {
      statusBar.register.mockClear();
      activate(context);
      expect(statusBar.register).toHaveBeenCalled();
    });

    it('should register an event handler to handle when the editor changes focus', () => {
      activate(context);

      expect(vscode.window.onDidChangeActiveTextEditor).toBeCalled();
      expect(context.subscriptions.push.mock.calls[0]).toContain('onDidChangeActiveTextEditor');
    });

    it('should register an event handler to handle when a document is saved', () => {
      activate(context);

      expect(vscode.workspace.onDidChangeTextDocument).toBeCalled();
      expect(context.subscriptions.push.mock.calls[0]).toContain('onDidChangeTextDocument');

      expect(vscode.workspace.onDidSaveTextDocument).toBeCalled();
      expect(vscode.workspace.onWillSaveTextDocument).toBeCalled();
    });

    it('should register an event handler to handle when an extension configuration changed', () => {
      activate(context);

      expect(vscode.workspace.onDidChangeConfiguration).toBeCalled();
      expect(context.subscriptions.push.mock.calls[0]).toContain('onDidChangeConfiguration');
    });

    it('should register an event handler to handle when workspace folders changed', () => {
      activate(context);

      expect(vscode.workspace.onDidChangeWorkspaceFolders).toBeCalled();
      expect(context.subscriptions.push.mock.calls[0]).toContain('onDidChangeWorkspaceFolders');
    });

    describe('should register extension commands', () => {
      beforeAll(() => {});
      beforeEach(() => {
        activate(context);
      });
      it.each`
        name                 | types                                     | callbackFunc
        ${'start'}           | ${['all-workspaces', 'select-workspace']} | ${jestInstance.startSession}
        ${'stop'}            | ${['all-workspaces', 'select-workspace']} | ${jestInstance.stopSession}
        ${'toggle-coverage'} | ${['all-workspaces', 'select-workspace']} | ${jestInstance.toggleCoverageOverlay}
        ${'run-all-tests'}   | ${['all-workspaces', 'select-workspace']} | ${jestInstance.runAllTests}
      `(
        'register extension-instance based command "$name" for types: $types',
        ({ name, types, callbackFunc }) => {
          const found = extensionManager.registerCommand.mock.calls.filter(
            ([cmd]) => cmd.name === name && types.includes(cmd.type)
          );
          expect(found).toHaveLength(types.length);
          found.forEach(([cmd]) => {
            (cmd.callback as any)(jestInstance);
            expect(callbackFunc).toBeCalled();
          });
        }
      );
      it.each`
        name                 | types                                                     | callbackFunc
        ${'toggle-coverage'} | ${['active-text-editor-workspace']}                       | ${jestInstance.toggleCoverageOverlay}
        ${'run-all-tests'}   | ${['active-text-editor-workspace', 'active-text-editor']} | ${jestInstance.runAllTests}
        ${'debug-tests'}     | ${['active-text-editor']}                                 | ${jestInstance.debugTests}
      `(
        'register editor based command "$name" for types: $types',
        ({ name, types, callbackFunc }) => {
          const editor = { document: {} };
          const found = extensionManager.registerCommand.mock.calls.filter(
            ([cmd]) => cmd.name === name && types.includes(cmd.type)
          );
          expect(found).toHaveLength(types.length);
          found.forEach(([cmd]) => {
            (cmd.callback as any)(jestInstance, editor);
            expect(callbackFunc).toBeCalled();
          });
        }
      );
    });

    it('to start setup-wizard', () => {
      activate(context);
      const callArg = context.subscriptions.push.mock.calls[0].find((args) => {
        return args[0] === `${extensionName}.setup-extension`;
      });

      expect(callArg).toBeDefined();
      callArg[1]();
      expect(startWizard).toHaveBeenCalled();
    });

    it('should register a DebugConfigurationProvider', () => {
      const register = vscode.debug.registerDebugConfigurationProvider as jest.Mock<any>;
      register.mockReset();

      activate(context);

      expect(register).toHaveBeenCalledTimes(2);
      const registeredAsNode = register.mock.calls.some((parameters) => parameters[0] === 'node');
      const registeredAsJestTest = register.mock.calls.some(
        (parameters) => parameters[0] === 'vscode-jest-tests'
      );
      expect(registeredAsNode && registeredAsJestTest).toBeTruthy();
    });
  });

  describe('deactivate()', () => {
    it('should call unregisterAll on instancesManager', () => {
      deactivate();
      expect(extensionManager.unregisterAll).toBeCalled();
    });
  });
});
