jest.unmock('events');
jest.unmock('../src/JestExt');
jest.unmock('../src/appGlobals');

jest.mock('../src/DebugCodeLens', () => ({
  DebugCodeLensProvider: class MockCodeLensProvider {},
}));
jest.mock('os');
jest.mock('../src/decorations/test-status', () => ({
  TestStatus: jest.fn(),
}));
jest.mock('../src/decorations/inline-error', () => ({
  default: jest.fn(),
}));

const update = jest.fn();
const statusBar = {
  bind: () => ({ update }),
};
jest.mock('../src/StatusBar', () => ({ statusBar }));

import * as vscode from 'vscode';
import { JestExt } from '../src/JestExt';
import { ProjectWorkspace } from 'jest-editor-support';
import { window, workspace, debug, ExtensionContext, TextEditorDecorationType } from 'vscode';
import { hasDocument, isOpenInMultipleEditors } from '../src/editor';
import { TestStatus } from '../src/decorations/test-status';
import { updateCurrentDiagnostics } from '../src/diagnostics';
import { JestProcessManager, JestProcess } from '../src/JestProcessManagement';
import * as messaging from '../src/messaging';
import { CoverageMapProvider } from '../src/Coverage';
import inlineError from '../src/decorations/inline-error';
import * as helper from '../src/helpers';
import { TestIdentifier } from '../src/TestResults';
import { extensionName } from '../src/appGlobals';

/* eslint jest/expect-expect: ["error", { "assertFunctionNames": ["expect", "expectItTakesNoAction"] }] */
const mockHelpers = helper as jest.Mocked<any>;

describe('JestExt', () => {
  const getConfiguration = workspace.getConfiguration as jest.Mock<any>;
  const StateDecorationsMock = TestStatus as jest.Mock;
  const context = { asAbsolutePath: (text) => text } as ExtensionContext;
  const workspaceFolder = { name: 'test-folder' } as any;
  let projectWorkspace: ProjectWorkspace;
  const channelStub = { appendLine: jest.fn(), clear: jest.fn(), show: jest.fn() } as any;
  const extensionSettings = { debugCodeLens: {} } as any;
  const debugCodeLensProvider = {} as any;
  const debugConfigurationProvider = {
    provideDebugConfigurations: jest.fn(),
    prepareTestRun: jest.fn(),
  } as any;

  console.error = jest.fn();
  console.warn = jest.fn();

  beforeEach(() => {
    jest.resetAllMocks();

    projectWorkspace = new ProjectWorkspace(null, null, null, null);
    getConfiguration.mockReturnValue({});
    mockHelpers.getJestCommandSettings.mockReturnValue([]);
  });

  describe('resetInlineErrorDecorators()', () => {
    let sut: JestExt;
    const editor: any = {
      document: { fileName: 'file.js' },
      setDecorations: jest.fn(),
    };
    const decorationType: any = { dispose: jest.fn() };

    beforeEach(() => {
      sut = new JestExt(
        context,
        workspaceFolder,
        projectWorkspace,
        channelStub,
        extensionSettings,
        debugCodeLensProvider,
        debugConfigurationProvider,
        null,
        null,
        null
      );

      sut.canUpdateActiveEditor = jest.fn().mockReturnValueOnce(true);
      sut.debugCodeLensProvider.didChange = jest.fn();
      ((sut.testResultProvider.getSortedResults as unknown) as jest.Mock<{}>).mockReturnValueOnce({
        success: [],
        fail: [],
        skip: [],
        unknown: [],
      });
    });

    it('should initialize the cached decoration types as an empty array', () => {
      expect(sut.failingAssertionDecorators[editor.document.fileName]).toBeUndefined();
      sut.triggerUpdateActiveEditor(editor);

      expect(sut.failingAssertionDecorators[editor.document.fileName]).toEqual([]);
      expect(isOpenInMultipleEditors).not.toBeCalled();
    });

    it('should not clear the cached decorations types when the document is open more than once', () => {
      ((isOpenInMultipleEditors as unknown) as jest.Mock<{}>).mockReturnValueOnce(true);

      sut.failingAssertionDecorators[editor.document.fileName] = {
        forEach: jest.fn(),
      } as any;
      sut.triggerUpdateActiveEditor(editor);

      expect(sut.failingAssertionDecorators[editor.document.fileName].forEach).not.toBeCalled();
    });

    it('should dispose of each cached decoration type', () => {
      sut.failingAssertionDecorators[editor.document.fileName] = [decorationType];
      sut.triggerUpdateActiveEditor(editor);

      expect(decorationType.dispose).toBeCalled();
    });

    it('should reset the cached decoration types', () => {
      sut.failingAssertionDecorators[editor.document.fileName] = [decorationType];
      sut.triggerUpdateActiveEditor(editor);

      expect(sut.failingAssertionDecorators[editor.document.fileName]).toEqual([]);
    });
  });

  describe('generateInlineErrorDecorator()', () => {
    it('should add the decoration type to the cache', () => {
      const settings: any = {
        debugCodeLens: {},
        enableInlineErrorMessages: true,
      };
      const expected = { key: 'value' };
      const failingAssertionStyle = inlineError as jest.Mock;
      failingAssertionStyle.mockReturnValueOnce(expected);
      const sut = new JestExt(
        context,
        workspaceFolder,
        projectWorkspace,
        channelStub,
        settings,
        debugCodeLensProvider,
        debugConfigurationProvider,
        null,
        null,
        null
      );
      const editor: any = {
        document: { fileName: 'file.js' },
        setDecorations: jest.fn(),
      };
      sut.canUpdateActiveEditor = jest.fn().mockReturnValueOnce(true);
      sut.testResultProvider.getSortedResults = jest.fn().mockReturnValueOnce({
        success: [],
        fail: [
          {
            start: {},
          },
        ],
        skip: [],
        unknown: [],
      });
      sut.debugCodeLensProvider.didChange = jest.fn();
      sut.triggerUpdateActiveEditor(editor);

      expect(sut.failingAssertionDecorators[editor.document.fileName]).toEqual([expected]);
    });
  });

  describe('runTest()', () => {
    const makeIdentifier = (title: string, ancestors?: string[]): TestIdentifier => ({
      title,
      ancestorTitles: ancestors || [],
    });
    const workspaceFolder = {} as any;
    const fileName = 'fileName';

    let sut: JestExt;
    let startDebugging, debugConfiguration, mockConfigurations;
    const mockShowQuickPick = jest.fn();

    beforeEach(() => {
      startDebugging = (debug.startDebugging as unknown) as jest.Mock<{}>;
      debugConfiguration = { type: 'dummyconfig' };
      debugConfigurationProvider.provideDebugConfigurations.mockReturnValue([debugConfiguration]);
      vscode.window.showQuickPick = mockShowQuickPick;
      mockHelpers.escapeRegExp.mockImplementation((s) => s);
      mockHelpers.testIdString.mockImplementation((_, s) => s);

      mockConfigurations = [];
      vscode.workspace.getConfiguration = jest.fn().mockReturnValue({
        get: jest.fn(() => mockConfigurations),
      });

      sut = new JestExt(
        context,
        workspaceFolder,
        projectWorkspace,
        channelStub,
        extensionSettings,
        debugCodeLensProvider,
        debugConfigurationProvider,
        null,
        null,
        null
      );
    });

    it('should run the supplied test', async () => {
      const testNamePattern = 'testNamePattern';
      await sut.runTest(workspaceFolder, fileName, testNamePattern);

      expect(startDebugging).toBeCalledTimes(1);
      expect(debug.startDebugging).toHaveBeenLastCalledWith(workspaceFolder, debugConfiguration);

      expect(sut.debugConfigurationProvider.prepareTestRun).toBeCalledWith(
        fileName,
        testNamePattern
      );
    });
    it.each`
      configNames                        | shouldShowWarning
      ${undefined}                       | ${true}
      ${[]}                              | ${true}
      ${['a', 'b']}                      | ${true}
      ${['a', 'vscode-jest-tests', 'b']} | ${false}
    `(
      'provides setup wizard in warning message if no "vscode-jest-tests" in launch.json: $configNames',
      async ({ configNames, shouldShowWarning }) => {
        expect.hasAssertions();
        const testNamePattern = 'testNamePattern';
        mockConfigurations = configNames ? configNames.map((name) => ({ name })) : undefined;
        await sut.runTest(workspaceFolder, fileName, testNamePattern);

        expect(startDebugging).toBeCalledTimes(1);
        if (shouldShowWarning) {
          // debug with generated config
          expect(debug.startDebugging).toHaveBeenLastCalledWith(
            workspaceFolder,
            debugConfiguration
          );
        } else {
          // debug with existing config
          expect(debug.startDebugging).toHaveBeenLastCalledWith(workspaceFolder, {
            name: 'vscode-jest-tests',
          });
        }

        expect(sut.debugConfigurationProvider.prepareTestRun).toBeCalledWith(
          fileName,
          testNamePattern
        );

        if (shouldShowWarning) {
          expect(messaging.systemWarningMessage).toHaveBeenCalled();

          //verify the message button does invoke the setup wizard command
          const button = (messaging.systemWarningMessage as jest.Mocked<any>).mock.calls[0][1];
          expect(button.action).not.toBeUndefined();
          vscode.commands.executeCommand = jest.fn();
          button.action();
          expect(vscode.commands.executeCommand).toBeCalledWith(
            `${extensionName}.setup-extension`,
            { workspace: workspaceFolder, taskId: 'debugConfig' }
          );
        } else {
          expect(messaging.systemWarningMessage).not.toHaveBeenCalled();
        }
      }
    );

    it('can handle testIdentifier argument', async () => {
      const tId = makeIdentifier('test-1', ['d-1', 'd-1-1']);
      const fullName = 'd-1 d-1-1 test-1';
      mockHelpers.testIdString.mockReturnValue(fullName);
      await sut.runTest(workspaceFolder, fileName, tId);

      expect(debug.startDebugging).toHaveBeenCalledWith(workspaceFolder, debugConfiguration);

      const configuration = startDebugging.mock.calls[startDebugging.mock.calls.length - 1][1];
      expect(configuration).toBeDefined();
      expect(configuration.type).toBe('dummyconfig');

      // test identifier is cleaned up before debug
      expect(mockHelpers.testIdString).toBeCalledWith('full-name', tId);
      expect(sut.debugConfigurationProvider.prepareTestRun).toBeCalledWith(fileName, fullName);
    });
    it.each`
      desc                      | testIds                                | testIdStringCount | startDebug
      ${'0 id'}                 | ${[]}                                  | ${0}              | ${false}
      ${'1 string id '}         | ${['test-1']}                          | ${0}              | ${true}
      ${'1 testIdentifier id '} | ${[makeIdentifier('test-1', ['d-1'])]} | ${1}              | ${true}
    `('no selection needed: $desc', async ({ testIds, testIdStringCount, startDebug }) => {
      await sut.runTest(workspaceFolder, fileName, ...testIds);

      expect(mockShowQuickPick).not.toBeCalled();

      expect(mockHelpers.testIdString).toBeCalledTimes(testIdStringCount);
      if (testIdStringCount >= 1) {
        expect(mockHelpers.testIdString).toHaveBeenLastCalledWith('full-name', testIds[0]);
        expect(mockHelpers.escapeRegExp).toHaveBeenCalled();
      }
      if (startDebug) {
        expect(debug.startDebugging).toHaveBeenCalledWith(workspaceFolder, debugConfiguration);

        const configuration = startDebugging.mock.calls[startDebugging.mock.calls.length - 1][1];
        expect(configuration).toBeDefined();
        expect(configuration.type).toBe('dummyconfig');

        expect(sut.debugConfigurationProvider.prepareTestRun).toHaveBeenCalled();
      } else {
        expect(sut.debugConfigurationProvider.prepareTestRun).not.toHaveBeenCalled();
        expect(debug.startDebugging).not.toHaveBeenCalled();
      }
    });
    describe('paramerterized test', () => {
      describe.each`
        desc                 | tId1                                 | tId2                                 | tId3                                 | selectIdx
        ${'testIdentifiers'} | ${makeIdentifier('test-1', ['d-1'])} | ${makeIdentifier('test-2', ['d-1'])} | ${makeIdentifier('test-3', ['d-1'])} | ${0}
        ${'string ids'}      | ${'d-1 test-1'}                      | ${'d-1 test-2'}                      | ${'d-1 test-3'}                      | ${2}
        ${'mixed ids'}       | ${'d-1 test-1'}                      | ${makeIdentifier('test-2', ['d-1'])} | ${'d-1 test-3'}                      | ${1}
      `('with $desc', ({ tId1, tId2, tId3, selectIdx }) => {
        let identifierIdCount = 0;
        beforeEach(() => {
          mockShowQuickPick.mockImplementation((items) => Promise.resolve(items[selectIdx]));
          identifierIdCount = [tId1, tId2, tId3].filter((id) => typeof id !== 'string').length;
        });
        it('can run selected test', async () => {
          // user choose the 2nd test: tId2
          await sut.runTest(workspaceFolder, fileName, tId1, tId2, tId3);

          // user has made selection to choose from 3 candidates
          expect(mockShowQuickPick).toHaveBeenCalledTimes(1);
          const [items] = mockShowQuickPick.mock.calls[0];
          expect(items).toHaveLength(3);

          if (identifierIdCount) {
            // id string is called 4 times: 3 to construt the quickPickIems, the last one is for jest test fullName
            expect(mockHelpers.testIdString).toBeCalledTimes(identifierIdCount + 1);
            const calls = mockHelpers.testIdString.mock.calls;
            expect(
              calls.slice(0, identifierIdCount).every((c) => c[0] === 'display-reverse')
            ).toBeTruthy();
            expect(calls[calls.length - 1][0]).toEqual('full-name');
          } else {
            expect(mockHelpers.testIdString).toBeCalledTimes(0);
          }
          const selected = [tId1, tId2, tId3][selectIdx];
          expect(mockHelpers.escapeRegExp).toBeCalledWith(selected);

          // verify the actual test to be run is the one we selected: tId2
          expect(debug.startDebugging).toHaveBeenCalledWith(workspaceFolder, debugConfiguration);

          const configuration = startDebugging.mock.calls[startDebugging.mock.calls.length - 1][1];
          expect(configuration).toBeDefined();
          expect(configuration.type).toBe('dummyconfig');

          expect(sut.debugConfigurationProvider.prepareTestRun).toBeCalledWith(fileName, selected);
        });
        it('if user did not choose any test, no debug will be run', async () => {
          selectIdx = -1;
          await sut.runTest(workspaceFolder, fileName, tId1, tId2, tId3);

          const mockProcessManager = (JestProcessManager as jest.Mocked<any>).mock.instances[0];
          expect(mockProcessManager.stopAll).not.toHaveBeenCalled();

          expect(mockShowQuickPick).toHaveBeenCalledTimes(1);
          expect(debug.startDebugging).not.toHaveBeenCalled();
        });
        it('if pass zero testId, nothing will be run', async () => {
          await sut.runTest(workspaceFolder, fileName);

          expect(mockShowQuickPick).not.toHaveBeenCalled();
          expect(mockHelpers.testIdString).not.toBeCalled();
          expect(debug.startDebugging).not.toHaveBeenCalled();
        });
      });
    });
  });

  describe('onDidCloseTextDocument()', () => {
    const projectWorkspace = new ProjectWorkspace(null, null, null, null);
    const sut = new JestExt(
      context,
      workspaceFolder,
      projectWorkspace,
      channelStub,
      extensionSettings,
      debugCodeLensProvider,
      debugConfigurationProvider,
      null,
      null,
      null
    );
    const document = {} as any;
    sut.removeCachedTestResults = jest.fn();
    sut.removeCachedDecorationTypes = jest.fn();

    it('should remove the cached test results', () => {
      sut.onDidCloseTextDocument(document);
      expect(sut.removeCachedTestResults).toBeCalledWith(document);
    });

    it('should remove the cached decorations', () => {
      sut.onDidCloseTextDocument(document);
      expect(sut.removeCachedDecorationTypes).toBeCalled();
    });
  });

  describe('removeCachedTestResults()', () => {
    const projectWorkspace = new ProjectWorkspace(null, null, null, null);
    const sut = new JestExt(
      context,
      workspaceFolder,
      projectWorkspace,
      channelStub,
      extensionSettings,
      debugCodeLensProvider,
      debugConfigurationProvider,
      null,
      null,
      null
    );
    sut.testResultProvider.removeCachedResults = jest.fn();

    it('should do nothing when the document is falsy', () => {
      sut.removeCachedTestResults(null);
      expect(sut.testResultProvider.removeCachedResults).not.toBeCalled();
    });

    it('should do nothing when the document is untitled', () => {
      const document: any = { isUntitled: true } as any;
      sut.removeCachedTestResults(document);

      expect(sut.testResultProvider.removeCachedResults).not.toBeCalled();
    });

    it('should reset the test result cache for the document', () => {
      const expected = 'file.js';
      sut.removeCachedTestResults({ fileName: expected } as any);

      expect(sut.testResultProvider.removeCachedResults).toBeCalledWith(expected);
    });
  });

  describe('removeCachedAnnotations()', () => {
    const projectWorkspace = new ProjectWorkspace(null, null, null, null);
    const sut = new JestExt(
      context,
      workspaceFolder,
      projectWorkspace,
      channelStub,
      extensionSettings,
      debugCodeLensProvider,
      debugConfigurationProvider,
      null,
      null,
      null
    );

    beforeEach(() => {
      sut.failingAssertionDecorators = {
        'file.js': [],
      };
    });

    it('should do nothing when the document is falsy', () => {
      sut.onDidCloseTextDocument(null);

      expect(sut.failingAssertionDecorators['file.js']).toBeDefined();
    });

    it('should remove the annotations for the document', () => {
      const document: any = { fileName: 'file.js' } as any;
      sut.onDidCloseTextDocument(document);

      expect(sut.failingAssertionDecorators['file.js']).toBeUndefined();
    });
  });

  describe('onDidChangeActiveTextEditor()', () => {
    const editor: any = {};
    const projectWorkspace = new ProjectWorkspace(null, null, null, null);
    const sut = new JestExt(
      context,
      workspaceFolder,
      projectWorkspace,
      channelStub,
      extensionSettings,
      debugCodeLensProvider,
      debugConfigurationProvider,
      null,
      null,
      null
    );
    sut.triggerUpdateActiveEditor = jest.fn();

    beforeEach(() => {
      (sut.triggerUpdateActiveEditor as jest.Mock<{}>).mockReset();
    });

    it('should update the annotations when the editor has a document', () => {
      ((hasDocument as unknown) as jest.Mock<{}>).mockReturnValueOnce(true);
      sut.onDidChangeActiveTextEditor(editor);

      expect(sut.triggerUpdateActiveEditor).toBeCalledWith(editor);
    });
  });

  describe('onDidChangeTextDocument()', () => {
    let sut;
    const event: any = {
      document: {
        isDirty: false,
        uri: { scheme: 'file' },
      },
      contentChanges: [],
    };

    beforeEach(() => {
      const projectWorkspace = new ProjectWorkspace(null, null, null, null);
      sut = new JestExt(
        context,
        workspaceFolder,
        projectWorkspace,
        channelStub,
        extensionSettings,
        debugCodeLensProvider,
        debugConfigurationProvider,
        null,
        null,
        null
      );
    });

    function expectItTakesNoAction(event) {
      sut.removeCachedTestResults = jest.fn();
      sut.triggerUpdateActiveEditor = jest.fn();
      sut.onDidChangeTextDocument(event);

      expect(sut.removeCachedTestResults).not.toBeCalledWith(event.document);
      expect(sut.triggerUpdateActiveEditor).not.toBeCalled();
    }

    it('should do nothing if the document has unsaved changes', () => {
      const event: any = {
        document: {
          isDirty: true,
          uri: { scheme: 'file' },
        },
        contentChanges: [],
      };
      expectItTakesNoAction(event);
    });

    it('should do nothing if the document URI scheme is "git"', () => {
      const event: any = {
        document: {
          isDirty: false,
          uri: {
            scheme: 'git',
          },
        },
        contentChanges: [],
      };
      expectItTakesNoAction(event);
    });

    it('should do nothing if the document is clean but there are changes', () => {
      const event = {
        document: {
          isDirty: false,
          uri: { scheme: 'file' },
        },
        contentChanges: { length: 1 },
      };
      expectItTakesNoAction(event);
    });

    it('should remove the cached test results if the document is clean', () => {
      sut.removeCachedTestResults = jest.fn();
      window.visibleTextEditors = [];
      sut.onDidChangeTextDocument(event);

      expect(sut.removeCachedTestResults).toBeCalledWith(event.document);
    });

    it('should update the decorations', () => {
      const editor: any = { document: event.document };
      sut.triggerUpdateActiveEditor = jest.fn();
      window.visibleTextEditors = [editor];
      sut.onDidChangeTextDocument(event);

      expect(sut.triggerUpdateActiveEditor).toBeCalledWith(editor);
    });
  });

  describe('toggleCoverageOverlay()', () => {
    it('should toggle the coverage overlay visibility', () => {
      const sut = new JestExt(
        context,
        workspaceFolder,
        projectWorkspace,
        channelStub,
        extensionSettings,
        debugCodeLensProvider,
        debugConfigurationProvider,
        null,
        null,
        null
      );
      sut.triggerUpdateSettings = jest.fn();
      sut.toggleCoverageOverlay();

      expect(sut.coverageOverlay.toggleVisibility).toBeCalled();
      expect(sut.triggerUpdateSettings).toBeCalled();
    });
    it('overrides showCoverageOnLoad settings', () => {
      const settings = { showCoverageOnLoad: true } as any;
      const sut = new JestExt(
        context,
        workspaceFolder,
        projectWorkspace,
        channelStub,
        settings,
        debugCodeLensProvider,
        debugConfigurationProvider,
        null,
        null,
        null
      );
      expect(projectWorkspace.collectCoverage).toBe(true);

      sut.restartProcess = jest.fn();
      sut.coverageOverlay.enabled = false;
      sut.toggleCoverageOverlay();

      expect(projectWorkspace.collectCoverage).toBe(false);
    });
  });

  describe('triggerUpdateActiveEditor()', () => {
    beforeEach(() => {
      jest.resetAllMocks();
    });
    it('should update the coverage overlay in visible editors', () => {
      const editor: any = {};

      const sut = new JestExt(
        context,
        workspaceFolder,
        projectWorkspace,
        channelStub,
        extensionSettings,
        debugCodeLensProvider,
        debugConfigurationProvider,
        null,
        null,
        null
      );
      sut.triggerUpdateActiveEditor(editor);

      expect(sut.coverageOverlay.updateVisibleEditors).toBeCalled();
    });
    it('should update both decorators and diagnostics for valid editor', () => {
      const sut = new JestExt(
        context,
        workspaceFolder,
        projectWorkspace,
        channelStub,
        extensionSettings,
        debugCodeLensProvider,
        debugConfigurationProvider,
        null,
        null,
        null
      );
      sut.updateDecorators = jest.fn();
      const mockEditor: any = {
        document: { uri: { fsPath: 'file://a/b/c.ts' } },
      };
      ((sut.testResultProvider.getSortedResults as unknown) as jest.Mock<{}>).mockReturnValueOnce({
        success: [],
        fail: [],
        skip: [],
        unknown: [],
      });
      sut.triggerUpdateActiveEditor(mockEditor);

      expect(sut.updateDecorators).toBeCalled();
      expect(updateCurrentDiagnostics).toBeCalled();
    });
  });

  describe('canUpdateActiveEditor', () => {
    const mockTextEditor = (ext: string): any => {
      const extension = ext.length ? `.${ext}` : '';
      return {
        document: { uri: { fsPath: `file://a/b/c${extension}` } },
      };
    };

    let sut;
    beforeEach(() => {
      jest.resetAllMocks();
      const projectWorkspace = new ProjectWorkspace(null, null, null, null);
      sut = new JestExt(
        context,
        workspaceFolder,
        projectWorkspace,
        channelStub,
        extensionSettings,
        debugCodeLensProvider,
        debugConfigurationProvider,
        null,
        null,
        null
      );
    });
    it('will skip if there is no document in editor', () => {
      const editor: any = {};
      expect(sut.canUpdateActiveEditor(editor)).toBe(false);
    });
    it('can not update if file is being parsed', () => {
      expect(sut.canUpdateActiveEditor(mockTextEditor('js'))).toBe(true);
      sut.parsingTestFile = true;
      expect(sut.canUpdateActiveEditor(mockTextEditor('js'))).toBe(false);
    });
    it('can only update if document is a typescript or javascript file', () => {
      expect(sut.canUpdateActiveEditor(mockTextEditor('json'))).toBe(false);
      expect(sut.canUpdateActiveEditor(mockTextEditor(''))).toBe(false);

      expect(sut.canUpdateActiveEditor(mockTextEditor('js'))).toBe(true);
      expect(sut.canUpdateActiveEditor(mockTextEditor('jsx'))).toBe(true);
      expect(sut.canUpdateActiveEditor(mockTextEditor('ts'))).toBe(true);
      expect(sut.canUpdateActiveEditor(mockTextEditor('tsx'))).toBe(true);
    });
  });
  describe('updateDecorators', () => {
    let sut: JestExt;
    const mockEditor: any = { document: { uri: { fsPath: `file://a/b/c.js` } } };
    const emptyTestResults = { success: [], fail: [], skip: [], unknown: [] };
    const failingAssertionStyle = inlineError as jest.Mock;

    const settings: any = {
      debugCodeLens: {},
      enableInlineErrorMessages: false,
    };

    const tr1 = {
      start: { line: 1, column: 0 },
    };
    const tr2 = {
      start: { line: 100, column: 0 },
    };

    beforeEach(() => {
      jest.resetAllMocks();
      StateDecorationsMock.mockImplementation(() => ({
        passing: { key: 'pass' } as TextEditorDecorationType,
        failing: { key: 'fail' } as TextEditorDecorationType,
        skip: { key: 'skip' } as TextEditorDecorationType,
        unknown: { key: 'unknown' } as TextEditorDecorationType,
      }));
      const projectWorkspace = new ProjectWorkspace(null, null, null, null);
      sut = new JestExt(
        context,
        workspaceFolder,
        projectWorkspace,
        channelStub,
        settings,
        debugCodeLensProvider,
        debugConfigurationProvider,
        null,
        null,
        null
      );

      mockEditor.setDecorations = jest.fn();
      sut.debugCodeLensProvider.didChange = jest.fn();
    });

    it('will reset decorator if testResults is empty', () => {
      sut.updateDecorators(emptyTestResults, mockEditor);
      expect(mockEditor.setDecorations).toHaveBeenCalledTimes(4);
      for (const args of mockEditor.setDecorations.mock.calls) {
        expect(args[1].length).toBe(0);
      }
    });
    it('will generate dot dectorations for test results', () => {
      const testResults2: any = { success: [tr1], fail: [tr2], skip: [], unknown: [] };
      sut.updateDecorators(testResults2, mockEditor);
      expect(mockEditor.setDecorations).toHaveBeenCalledTimes(4);
      for (const args of mockEditor.setDecorations.mock.calls) {
        switch (args[0].key) {
          case 'fail':
          case 'pass':
            expect(args[1].length).toBe(1);
            break;
          case 'skip':
          case 'unknown':
            expect(args[1].length).toBe(0);
            break;
          default:
            expect(args[0].key).toBe('never be here');
        }
      }
    });

    it('will update inlineError decorator only if setting is enabled', () => {
      const testResults2: any = { success: [], fail: [tr1, tr2], skip: [], unknown: [] };
      const expected = {};
      failingAssertionStyle.mockReturnValueOnce(expected);
      sut.updateDecorators(testResults2, mockEditor);
      expect(failingAssertionStyle).not.toBeCalled();
      expect(mockEditor.setDecorations).toHaveBeenCalledTimes(4);

      jest.clearAllMocks();
      settings.enableInlineErrorMessages = true;
      sut.updateDecorators(testResults2, mockEditor);
      expect(failingAssertionStyle).toHaveBeenCalledTimes(2);
      expect(mockEditor.setDecorations).toHaveBeenCalledTimes(6);
    });
  });

  describe('detectedSnapshotErrors()', () => {
    let sut: JestExt;
    const mockEditor: any = { document: { uri: { fsPath: `file://a/b/c.js` } } };

    const settings: any = {
      debugCodeLens: {},
      enableSnapshotUpdateMessages: true,
    };

    beforeEach(() => {
      jest.resetAllMocks();
      const projectWorkspace = new ProjectWorkspace(null, null, null, null);
      sut = new JestExt(
        context,
        workspaceFolder,
        projectWorkspace,
        channelStub,
        settings,
        debugCodeLensProvider,
        debugConfigurationProvider,
        null,
        null,
        null
      );

      mockEditor.setDecorations = jest.fn();
      sut.debugCodeLensProvider.didChange = jest.fn();
      mockHelpers.cleanAnsi.mockImplementation((s) => s);
    });

    it('will trigger snapshot update message when a snapshot test fails', () => {
      window.showInformationMessage = jest.fn(async () => null);
      const spy = jest.spyOn(sut as any, 'detectedSnapshotErrors');
      (sut as any).handleStdErr(new Error('Snapshot test failed'));
      (sut as any).handleStdErr(new Error('Snapshot failed'));
      (sut as any).handleStdErr(new Error('Snapshots failed'));
      (sut as any).handleStdErr(new Error('Failed for some other reason'));
      expect(spy).toHaveBeenCalledTimes(3);
    });
  });

  describe('startProcess', () => {
    const projectWorkspace = new ProjectWorkspace(null, null, null, null);

    const mockJestProcess = () => {
      const mockProcess: any = new JestProcess({ projectWorkspace });
      mockProcess.onJestEditorSupportEvent.mockReturnValue(mockProcess);
      return mockProcess;
    };
    const createJestExt = (settings: any, instanceSettings = { multirootEnv: false }) => {
      (JestProcessManager as jest.Mock).mockClear();
      const mockProcess: any = mockJestProcess();

      const jestExt = new JestExt(
        context,
        workspaceFolder,
        projectWorkspace,
        channelStub,
        settings,
        debugCodeLensProvider,
        debugConfigurationProvider,
        null,
        instanceSettings,
        null
      );
      const mockProcessManager: any = (JestProcessManager as jest.Mock).mock.instances[0];
      mockProcessManager.startJestProcess.mockReturnValue(mockProcess);
      return [jestExt, mockProcessManager];
    };
    it('if process already running, do nothing', () => {
      const [sut, mockProcessManager] = createJestExt(extensionSettings);
      mockProcessManager.numberOfProcesses = 1;
      sut.startProcess();
      expect(mockProcessManager.startJestProcess).not.toHaveBeenCalled();
    });
    it('can start all tests first if configured.', () => {
      const [sut, mockProcessManager] = createJestExt({
        ...extensionSettings,
        runAllTestsFirst: true,
      });

      const { runAllTestsFirstInWatchMode } = (JestProcessManager as jest.Mock).mock.calls[0][0];
      expect(runAllTestsFirstInWatchMode).toBeTruthy();

      sut.startProcess();
      expect(mockProcessManager.startJestProcess).toHaveBeenCalled();
    });
    it('can start watch mode first if configured.', () => {
      const [sut, mockProcessManager] = createJestExt({
        ...extensionSettings,
        runAllTestsFirst: false,
      });

      const { runAllTestsFirstInWatchMode } = (JestProcessManager as jest.Mock).mock.calls[0][0];
      expect(runAllTestsFirstInWatchMode).toBeFalsy();

      sut.startProcess();
      expect(mockProcessManager.startJestProcess).toHaveBeenCalled();
    });

    describe('exitCallback', () => {
      const [sut, mockProcessManager] = createJestExt(extensionSettings, { multirootEnv: true });
      sut.startProcess();
      const { exitCallback } = mockProcessManager.startJestProcess.mock.calls[0][0];

      it('if receive watchMode process: prepare and report for the next run', () => {
        const p1: any = mockJestProcess();
        const p2: any = mockJestProcess();

        exitCallback(p1, p2);

        expect(p1.onJestEditorSupportEvent).not.toHaveBeenCalled();
        expect(p2.onJestEditorSupportEvent).toHaveBeenCalled();
      });
      it('if process ends unexpectedly, report error', () => {
        const p1: any = mockJestProcess();
        p1.stopRequested.mockReturnValue(false);
        exitCallback(p1);
        expect(p1.onJestEditorSupportEvent).not.toHaveBeenCalled();
        expect(messaging.systemErrorMessage).toHaveBeenCalled();
        const msg: string = (messaging.systemErrorMessage as jest.Mock).mock.calls[0][0];
        expect(msg.includes(workspaceFolder.name)).toBeTruthy();
      });
    });
  });

  describe('handleJestEditorSupportEvent()', () => {
    let sut: JestExt;

    const settings: any = {
      debugCodeLens: {},
      enableSnapshotUpdateMessages: true,
    };

    beforeEach(() => {
      jest.resetAllMocks();
      const projectWorkspace = new ProjectWorkspace(null, null, null, null);
      sut = new JestExt(
        context,
        workspaceFolder,
        projectWorkspace,
        channelStub,
        settings,
        debugCodeLensProvider,
        debugConfigurationProvider,
        null,
        null,
        null
      );
    });

    it('will change status according to received output', () => {
      update.mockClear();
      (sut as any).handleJestEditorSupportEvent('onRunStart');
      expect(update).toHaveBeenCalledTimes(1);
      expect(update).toHaveBeenCalledWith('running', 'Running tests', []);
      update.mockClear();
      (sut as any).handleJestEditorSupportEvent('onRunComplete');
      expect(update).toHaveBeenCalledTimes(1);
      expect(update).toHaveBeenCalledWith('stopped', undefined, []);
    });

    it('will append line to output', () => {
      channelStub.appendLine.mockClear();
      (sut as any).handleJestEditorSupportEvent('not ignored output');
      expect(channelStub.appendLine).toHaveBeenCalledTimes(1);
      expect(channelStub.appendLine).toHaveBeenCalledWith('not ignored output');
      channelStub.appendLine.mockClear();
      (sut as any).handleJestEditorSupportEvent('onRunComplete');
      expect(channelStub.appendLine).not.toHaveBeenCalled();
    });
  });
  describe('_updateCoverageMap', () => {
    it('the overlay and codeLens will be updated when map updated async', async () => {
      expect.hasAssertions();
      (CoverageMapProvider as jest.Mock<any>).mockImplementation(() => ({
        update: () => Promise.resolve(),
      }));
      const coverageCodeLensProvider: any = { coverageChanged: jest.fn() };
      const sut = new JestExt(
        context,
        workspaceFolder,
        projectWorkspace,
        channelStub,
        extensionSettings,
        debugCodeLensProvider,
        debugConfigurationProvider,
        null,
        null,
        coverageCodeLensProvider
      );
      await sut._updateCoverageMap({});
      expect(coverageCodeLensProvider.coverageChanged).toBeCalled();
      expect(sut.coverageOverlay.updateVisibleEditors).toBeCalled();
    });
  });
});
