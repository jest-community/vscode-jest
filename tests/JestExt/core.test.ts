/* eslint-disable jest/no-conditional-expect */
jest.unmock('events');
jest.unmock('../../src/JestExt/core');
jest.unmock('../../src/JestExt/helper');
jest.unmock('../../src/appGlobals');
jest.unmock('../test-helper');

jest.mock('../../src/DebugCodeLens', () => ({
  DebugCodeLensProvider: class MockCodeLensProvider {},
}));
jest.mock('os');
jest.mock('../../src/decorations/test-status', () => ({
  TestStatus: jest.fn(),
}));
jest.mock('../../src/decorations/inline-error', () => ({
  default: jest.fn(),
}));

const update = jest.fn();
const statusBar = {
  bind: () => ({ update }),
};
jest.mock('../../src/StatusBar', () => ({ statusBar }));
jest.mock('jest-editor-support');

import * as vscode from 'vscode';
import { JestExt } from '../../src/JestExt/core';
import { createProcessSession } from '../../src/JestExt/process-session';
import { window, workspace, debug, ExtensionContext, TextEditorDecorationType } from 'vscode';
import { hasDocument, isOpenInMultipleEditors } from '../../src/editor';
import { TestStatus } from '../../src/decorations/test-status';
import { updateCurrentDiagnostics, updateDiagnostics } from '../../src/diagnostics';
import { CoverageMapProvider } from '../../src/Coverage';
import inlineError from '../../src/decorations/inline-error';
import * as helper from '../../src/helpers';
import { TestIdentifier, resultsWithLowerCaseWindowsDriveLetters } from '../../src/TestResults';
import * as messaging from '../../src/messaging';
import { PluginResourceSettings } from '../../src/Settings';
import * as extHelper from '../..//src/JestExt/helper';
import { workspaceLogging } from '../../src/logging';
import { ProjectWorkspace } from 'jest-editor-support';
import { mockProjectWorkspace, mockWworkspaceLogging } from '../test-helper';
import { startWizard } from '../../src/setup-wizard';

/* eslint jest/expect-expect: ["error", { "assertFunctionNames": ["expect", "expectItTakesNoAction"] }] */
const mockHelpers = helper as jest.Mocked<any>;

const EmptySortedResult = {
  fail: [],
  skip: [],
  success: [],
  unknown: [],
};
const mockGetExtensionResourceSettings = jest.spyOn(extHelper, 'getExtensionResourceSettings');

describe('JestExt', () => {
  const getConfiguration = workspace.getConfiguration as jest.Mock<any>;
  const StateDecorationsMock = TestStatus as jest.Mock;
  const context: any = { asAbsolutePath: (text) => text } as ExtensionContext;
  const workspaceFolder = { name: 'test-folder' } as any;
  const channelStub = {
    appendLine: jest.fn(),
    clear: jest.fn(),
    show: jest.fn(),
    dispose: jest.fn(),
  } as any;
  const extensionSettings = { debugCodeLens: {} } as any;
  const debugCodeLensProvider = {} as any;
  const debugConfigurationProvider = {
    provideDebugConfigurations: jest.fn(),
    prepareTestRun: jest.fn(),
  } as any;

  const mockProcessSession = {
    start: jest.fn(),
    stop: jest.fn(),
    scheduleProcess: jest.fn(),
  };

  console.error = jest.fn();
  console.warn = jest.fn();

  const newJestExt = (override?: {
    settings?: Partial<PluginResourceSettings>;
    coverageCodeLensProvider?: any;
  }) => {
    mockGetExtensionResourceSettings.mockReturnValue(
      override?.settings ? { ...extensionSettings, ...override.settings } : extensionSettings
    );
    const coverageCodeLensProvider: any = override?.coverageCodeLensProvider ?? {
      coverageChanged: jest.fn(),
    };
    return new JestExt(
      context,
      workspaceFolder,
      debugCodeLensProvider,
      debugConfigurationProvider,
      coverageCodeLensProvider
    );
  };
  const mockEditor = (fileName: string, languageId = 'typescript'): any => {
    return {
      document: { fileName, languageId, uri: fileName },
      setDecorations: jest.fn(),
    };
  };

  beforeEach(() => {
    jest.resetAllMocks();

    getConfiguration.mockReturnValue({});

    (vscode.window.createOutputChannel as jest.Mocked<any>).mockReturnValue(channelStub);

    (createProcessSession as jest.Mocked<any>).mockReturnValue(mockProcessSession);
    (ProjectWorkspace as jest.Mocked<any>).mockImplementation(mockProjectWorkspace);
    (workspaceLogging as jest.Mocked<any>).mockImplementation(mockWworkspaceLogging);
  });

  describe('resetInlineErrorDecorators()', () => {
    let sut: JestExt;
    const editor = mockEditor('file.js', 'javascript');
    const decorationType: any = { dispose: jest.fn() };

    beforeEach(() => {
      sut = newJestExt();

      sut.debugCodeLensProvider.didChange = jest.fn();
      ((sut.testResultProvider.getSortedResults as unknown) as jest.Mock<{}>).mockReturnValueOnce(
        EmptySortedResult
      );
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
      const sut = newJestExt({ settings });
      const editor = mockEditor('file.ts');
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

  describe('debugTests()', () => {
    const makeIdentifier = (title: string, ancestors?: string[]): TestIdentifier => ({
      title,
      ancestorTitles: ancestors || [],
    });
    const fileName = 'fileName';
    const document: any = { fileName };
    let sut: JestExt;
    let startDebugging, debugConfiguration;
    const mockShowQuickPick = jest.fn();
    let mockConfigurations = [];
    beforeEach(() => {
      startDebugging = (debug.startDebugging as unknown) as jest.Mock<{}>;
      ((startDebugging as unknown) as jest.Mock<{}>).mockImplementation(
        async (_folder: any, nameOrConfig: any) => {
          // trigger fallback to default configuration
          if (typeof nameOrConfig === 'string') {
            throw null;
          }
        }
      );
      debugConfiguration = { type: 'dummyconfig' };
      debugConfigurationProvider.provideDebugConfigurations.mockReturnValue([debugConfiguration]);
      vscode.window.showQuickPick = mockShowQuickPick;
      mockHelpers.escapeRegExp.mockImplementation((s) => s);
      mockHelpers.testIdString.mockImplementation((_, s) => s);

      mockConfigurations = [];
      vscode.workspace.getConfiguration = jest.fn().mockReturnValue({
        get: jest.fn(() => mockConfigurations),
      });

      sut = newJestExt();
    });
    it('should run the supplied test', async () => {
      const testNamePattern = 'testNamePattern';
      await sut.debugTests(document, testNamePattern);
      expect(debug.startDebugging).toHaveBeenCalledWith(workspaceFolder, debugConfiguration);
      const configuration = startDebugging.mock.calls[startDebugging.mock.calls.length - 1][1];
      expect(configuration).toBeDefined();
      expect(configuration.type).toBe('dummyconfig');
      expect(sut.debugConfigurationProvider.prepareTestRun).toBeCalledWith(
        fileName,
        testNamePattern
      );
    });
    it('can handle testIdentifier argument', async () => {
      const tId = makeIdentifier('test-1', ['d-1', 'd-1-1']);
      const fullName = 'd-1 d-1-1 test-1';
      mockHelpers.testIdString.mockReturnValue(fullName);
      await sut.debugTests(document, tId);
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
      await sut.debugTests(document, ...testIds);
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
          await sut.debugTests(document, tId1, tId2, tId3);
          // user has made selection to choose from 3 candidates
          expect(mockShowQuickPick).toHaveBeenCalledTimes(1);
          const [items] = mockShowQuickPick.mock.calls[0];
          expect(items).toHaveLength(3);
          const hasIds = () => {
            // id string is called 4 times: 3 to construt the quickPickIems, the last one is for jest test fullName
            expect(mockHelpers.testIdString).toBeCalledTimes(identifierIdCount + 1);
            const calls = mockHelpers.testIdString.mock.calls;
            expect(
              calls.slice(0, identifierIdCount).every((c) => c[0] === 'display-reverse')
            ).toBeTruthy();
            expect(calls[calls.length - 1][0]).toEqual('full-name');
          };
          const hasNoId = () => {
            expect(mockHelpers.testIdString).toBeCalledTimes(0);
          };
          if (identifierIdCount) {
            hasIds();
          } else {
            hasNoId();
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
          await sut.debugTests(document, tId1, tId2, tId3);
          expect(mockShowQuickPick).toHaveBeenCalledTimes(1);
          expect(debug.startDebugging).not.toHaveBeenCalled();
        });
        it('if pass zero testId, nothing will be run', async () => {
          await sut.debugTests(document);
          expect(mockShowQuickPick).not.toHaveBeenCalled();
          expect(mockHelpers.testIdString).not.toBeCalled();
          expect(debug.startDebugging).not.toHaveBeenCalled();
        });
      });
    });
    it.each`
      configNames                        | shouldShowWarning | debugMode
      ${undefined}                       | ${true}           | ${true}
      ${[]}                              | ${true}           | ${true}
      ${['a', 'b']}                      | ${true}           | ${false}
      ${['a', 'vscode-jest-tests', 'b']} | ${false}          | ${false}
    `(
      'provides setup wizard in warning message if no "vscode-jest-tests" in launch.json: $configNames',
      async ({ configNames, shouldShowWarning, debugMode }) => {
        expect.hasAssertions();
        const testNamePattern = 'testNamePattern';
        mockConfigurations = configNames ? configNames.map((name) => ({ name })) : undefined;

        // mockProjectWorkspace.debug = debugMode;
        sut = newJestExt({ settings: { debugMode } });

        await sut.debugTests(document, testNamePattern);

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
          expect(startWizard).toBeCalledWith(sut.debugConfigurationProvider, {
            workspace: workspaceFolder,
            taskId: 'debugConfig',
            verbose: debugMode,
          });
        } else {
          expect(messaging.systemWarningMessage).not.toHaveBeenCalled();
        }
      }
    );
  });

  describe('onDidCloseTextDocument()', () => {
    const document = {} as any;
    let sut;
    beforeEach(() => {
      sut = newJestExt();
      sut.removeCachedTestResults = jest.fn();
      sut.removeCachedDecorationTypes = jest.fn();
    });

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
    let sut;
    beforeEach(() => {
      sut = newJestExt();
      sut.testResultProvider.removeCachedResults = jest.fn();
    });

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
    it('can invalidate test results', () => {
      const expected = 'file.js';
      sut.removeCachedTestResults({ fileName: expected } as any, true);

      expect(sut.testResultProvider.removeCachedResults).not.toBeCalled();
      expect(sut.testResultProvider.invalidateTestResults).toBeCalledWith(expected);
    });
  });

  describe('removeCachedAnnotations()', () => {
    let sut;
    beforeEach(() => {
      sut = newJestExt();

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
    let sut;

    beforeEach(() => {
      sut = newJestExt();
      sut.triggerUpdateActiveEditor = jest.fn();
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
    let event;

    beforeEach(() => {
      sut = newJestExt();
      event = {
        document: {
          isDirty: false,
          uri: { scheme: 'file' },
        },
        contentChanges: [],
      };
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

    it('should trigger updateActiveEditor', () => {
      const editor: any = { document: event.document };
      sut.triggerUpdateActiveEditor = jest.fn();
      window.visibleTextEditors = [editor];
      sut.onDidChangeTextDocument(event);

      expect(sut.triggerUpdateActiveEditor).toBeCalledWith(editor);
    });
    it('should update statusBar for stats', () => {
      const updateStatusBarSpy = jest.spyOn(sut as any, 'updateStatusBar');
      sut.onDidChangeTextDocument(event);

      expect(sut.testResultProvider.getTestSuiteStats).toBeCalled();
      expect(updateStatusBarSpy).toBeCalled();
    });
  });

  describe('onWillSaveTextDocument', () => {
    it.each([[true], [false]])(
      'ony invalidate test status if document is dirty: isDirty=%d',
      (isDirty) => {
        window.visibleTextEditors = [];
        const sut: any = newJestExt();
        sut.testResultProvider.invalidateTestResults = jest.fn();
        const event = {
          document: {
            isDirty,
            uri: { scheme: 'file' },
          },
        };
        sut.onWillSaveTextDocument(event);

        if (isDirty) {
          expect(sut.testResultProvider.invalidateTestResults).toBeCalled();
        } else {
          expect(sut.testResultProvider.invalidateTestResults).not.toBeCalled();
        }
      }
    );
  });
  describe('onDidSaveTextDocument', () => {
    describe('should handle onSave run', () => {
      it.each`
        runConfig                                    | languageId      | isTestFile   | shouldSchedule | isDirty
        ${'off'}                                     | ${'javascript'} | ${'yes'}     | ${false}       | ${true}
        ${{ watch: true }}                           | ${'javascript'} | ${'yes'}     | ${false}       | ${false}
        ${{ watch: false }}                          | ${'javascript'} | ${'yes'}     | ${false}       | ${true}
        ${{ watch: false, onSave: 'test-src-file' }} | ${'javascript'} | ${'no'}      | ${true}        | ${false}
        ${{ watch: false, onSave: 'test-src-file' }} | ${'javascript'} | ${'yes'}     | ${true}        | ${false}
        ${{ watch: false, onSave: 'test-src-file' }} | ${'json'}       | ${'no'}      | ${false}       | ${false}
        ${{ watch: false, onSave: 'test-file' }}     | ${'javascript'} | ${'no'}      | ${false}       | ${true}
        ${{ watch: false, onSave: 'test-file' }}     | ${'javascript'} | ${'unknown'} | ${true}        | ${false}
        ${{ watch: false, onSave: 'test-file' }}     | ${'javascript'} | ${'yes'}     | ${true}        | ${false}
        ${{ watch: false, onSave: 'test-file' }}     | ${'javascript'} | ${'unknown'} | ${true}        | ${false}
        ${{ watch: false, onSave: 'test-file' }}     | ${'json'}       | ${'unknown'} | ${false}       | ${false}
      `(
        'with autoRun: $runConfig $languageId $isTestFile => $shouldSchedule, $isDirty',
        ({ runConfig: autoRun, languageId, isTestFile, shouldSchedule, isDirty }) => {
          const sut: any = newJestExt({ settings: { autoRun } });
          const fileName = '/a/file;';
          const document: any = {
            uri: { scheme: 'file' },
            languageId: languageId,
            fileName,
          };

          window.visibleTextEditors = [];
          const updateStatusBarSpy = jest.spyOn(sut as any, 'updateStatusBar');

          (sut.testResultProvider.isTestFile as jest.Mocked<any>).mockReturnValueOnce(isTestFile);
          mockProcessSession.scheduleProcess.mockClear();

          sut.onDidSaveTextDocument(document);

          if (shouldSchedule) {
            expect(mockProcessSession.scheduleProcess).toBeCalledWith(
              expect.objectContaining({ type: 'by-file', testFileNamePattern: fileName })
            );
          } else {
            expect(mockProcessSession.scheduleProcess).not.toBeCalled();
          }
          expect(updateStatusBarSpy).toBeCalledWith(
            expect.objectContaining({ stats: { isDirty } })
          );
        }
      );
    });
  });
  describe('toggleCoverageOverlay()', () => {
    it('should toggle the coverage overlay visibility', () => {
      const sut = newJestExt();

      sut.triggerUpdateSettings = jest.fn();
      sut.toggleCoverageOverlay();

      expect(sut.coverageOverlay.toggleVisibility).toBeCalled();
      expect(sut.triggerUpdateSettings).toBeCalled();
    });
    it('overrides showCoverageOnLoad settings', async () => {
      const settings = { showCoverageOnLoad: true } as any;
      const sut = newJestExt({ settings });

      const { runnerWorkspace } = (createProcessSession as jest.Mocked<any>).mock.calls[0][0];
      expect(runnerWorkspace.collectCoverage).toBe(true);

      sut.coverageOverlay.enabled = false;
      await sut.toggleCoverageOverlay();

      const {
        runnerWorkspace: runnerWorkspace2,
      } = (createProcessSession as jest.Mocked<any>).mock.calls[1][0];
      expect(runnerWorkspace2.collectCoverage).toBe(false);
    });
  });

  describe('triggerUpdateActiveEditor()', () => {
    it('should update the coverage overlay in visible editors', () => {
      const editor: any = {};

      const sut = newJestExt();
      sut.triggerUpdateActiveEditor(editor);

      expect(sut.coverageOverlay.updateVisibleEditors).toBeCalled();
    });
    it('should update both decorators and diagnostics for valid editor', () => {
      const sut = newJestExt();
      sut.updateDecorators = jest.fn();
      const editor = mockEditor('file://a/b/c.ts');

      ((sut.testResultProvider.getSortedResults as unknown) as jest.Mock<{}>).mockReturnValueOnce({
        success: [],
        fail: [],
        skip: [],
        unknown: [],
      });
      sut.triggerUpdateActiveEditor(editor);

      expect(sut.updateDecorators).toBeCalled();
      expect(updateCurrentDiagnostics).toBeCalled();
    });
    it.each`
      autoRun                                                  | isInteractive
      ${'off'}                                                 | ${true}
      ${{ watch: true }}                                       | ${false}
      ${{ watch: false }}                                      | ${true}
      ${{ onStartup: ['all-tests'] }}                          | ${true}
      ${{ onSave: 'test-file' }}                               | ${true}
      ${{ onSave: 'test-src-file' }}                           | ${true}
      ${{ onSave: 'test-src-file', onStartup: ['all-tests'] }} | ${true}
    `('should update vscode editor context', ({ autoRun, isInteractive }) => {
      const sut = newJestExt({ settings: { autoRun } });
      const editor = mockEditor('a');
      sut.triggerUpdateActiveEditor(editor);
      expect(vscode.commands.executeCommand).toBeCalledWith(
        'setContext',
        'jest:run.interactive',
        isInteractive
      );
    });
    it('when failed to get test result, it should report error and clear the decorators and diagnostics', () => {
      const sut = newJestExt();
      const editor = mockEditor('a');
      (sut.testResultProvider.getSortedResults as jest.Mocked<any>).mockImplementation(() => {
        throw new Error('force error');
      });
      const updateDecoratorsSpy = jest.spyOn(sut, 'updateDecorators');

      sut.triggerUpdateActiveEditor(editor);
      expect(channelStub.appendLine).toBeCalledWith(expect.stringContaining('force error'));

      expect(updateDecoratorsSpy).toBeCalledWith(EmptySortedResult, editor);
      expect(updateCurrentDiagnostics).toBeCalledWith(EmptySortedResult.fail, undefined, editor);
    });
    describe('can skip test-file related updates', () => {
      let sut;
      let updateDecoratorsSpy;
      beforeEach(() => {
        sut = newJestExt();
        ((sut.testResultProvider.getSortedResults as unknown) as jest.Mock<{}>).mockReturnValueOnce(
          {
            success: [],
            fail: [],
            skip: [],
            unknown: [],
          }
        );
        updateDecoratorsSpy = jest.spyOn(sut, 'updateDecorators');
      });
      it.each`
        languageId           | shouldSkip
        ${'json'}            | ${true}
        ${''}                | ${true}
        ${'markdown'}        | ${true}
        ${'javascript'}      | ${false}
        ${'javascriptreact'} | ${false}
        ${'typescript'}      | ${false}
        ${'typescriptreact'} | ${false}
      `('if languageId=languageId => skip? $shouldSkip', ({ languageId, shouldSkip }) => {
        const editor = mockEditor('file', languageId);
        sut.triggerUpdateActiveEditor(editor);
        if (shouldSkip) {
          expect(updateCurrentDiagnostics).not.toBeCalled();
          expect(updateDecoratorsSpy).not.toBeCalled();
        } else {
          expect(updateCurrentDiagnostics).toBeCalled();
          expect(updateDecoratorsSpy).toBeCalled();
        }
      });
      it('if editor has no document', () => {
        const editor = {};
        sut.triggerUpdateActiveEditor(editor);
        expect(updateCurrentDiagnostics).not.toBeCalled();
        expect(updateDecoratorsSpy).not.toBeCalled();
      });
      it.each`
        isTestFile   | shouldUpdate
        ${'yes'}     | ${true}
        ${'no'}      | ${false}
        ${'unknown'} | ${true}
      `(
        'isTestFile: $isTestFile => shouldUpdate? $shouldUpdate',
        async ({ isTestFile, shouldUpdate }) => {
          // update testFiles
          await sut.startSession();

          const { type, onResult } = mockProcessSession.scheduleProcess.mock.calls[0][0];
          expect(type).toEqual('list-test-files');
          expect(onResult).not.toBeUndefined();

          (sut.testResultProvider.isTestFile as jest.Mocked<any>).mockReturnValueOnce(isTestFile);

          const editor = mockEditor('x');
          sut.triggerUpdateActiveEditor(editor);
          if (shouldUpdate) {
            expect(updateCurrentDiagnostics).toBeCalled();
            expect(updateDecoratorsSpy).toBeCalled();
          } else {
            expect(updateCurrentDiagnostics).not.toBeCalled();
            expect(updateDecoratorsSpy).not.toBeCalled();
          }
        }
      );
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
      StateDecorationsMock.mockImplementation(() => ({
        passing: { key: 'pass' } as TextEditorDecorationType,
        failing: { key: 'fail' } as TextEditorDecorationType,
        skip: { key: 'skip' } as TextEditorDecorationType,
        unknown: { key: 'unknown' } as TextEditorDecorationType,
      }));
      sut = newJestExt(settings);

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
        let expectedLength = -1;
        switch (args[0].key) {
          case 'fail':
          case 'pass':
            expectedLength = 1;
            break;
          case 'skip':
          case 'unknown':
            expectedLength = 0;
            break;
        }
        expect(args[1].length).toBe(expectedLength);
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
      sut = newJestExt({ settings });
      sut.updateDecorators(testResults2, mockEditor);
      expect(failingAssertionStyle).toHaveBeenCalledTimes(2);
      expect(mockEditor.setDecorations).toHaveBeenCalledTimes(6);
    });
  });

  describe('session', () => {
    const createJestExt = () => {
      const jestExt: any = newJestExt();

      return jestExt;
    };
    beforeEach(() => {});
    describe('startSession', () => {
      it('starts a new session and notify session aware components', async () => {
        const sut = createJestExt();
        await sut.startSession();
        expect(mockProcessSession.start).toHaveBeenCalled();
        expect(sut.testResultProvider.onSessionStart).toHaveBeenCalled();
      });
      it('if failed to start session, show error', async () => {
        mockProcessSession.start.mockReturnValueOnce(Promise.reject('forced error'));
        const sut = createJestExt();
        await sut.startSession();
        expect(messaging.systemErrorMessage).toBeCalled();
      });
      describe('will update test file list', () => {
        it.each`
          fileNames     | error                      | expectedTestFiles
          ${undefined}  | ${'some error'}            | ${undefined}
          ${undefined}  | ${new Error('some error')} | ${undefined}
          ${[]}         | ${undefined}               | ${[]}
          ${['a', 'b']} | ${undefined}               | ${['a', 'b']}
        `(
          'can schedule the request and process the result ($fileNames, $error)',
          async ({ fileNames, error, expectedTestFiles }) => {
            expect.hasAssertions();
            const sut = createJestExt();
            const updateStatusBarSpy = jest.spyOn(sut as any, 'updateStatusBar');
            const stats = { success: 1000, isDirty: false };
            sut.testResultProvider.getTestSuiteStats = jest.fn().mockReturnValueOnce(stats);

            await sut.startSession();

            expect(mockProcessSession.scheduleProcess).toBeCalledTimes(1);
            const { type, onResult } = mockProcessSession.scheduleProcess.mock.calls[0][0];
            expect(type).toEqual('list-test-files');
            expect(onResult).not.toBeUndefined();

            onResult(fileNames, error);
            expect(sut.testResultProvider.updateTestFileList).toBeCalledWith(expectedTestFiles);

            // stats will be updated in status baar accordingly
            expect(sut.testResultProvider.getTestSuiteStats).toBeCalled();
            expect(updateStatusBarSpy).toBeCalledWith({ stats });
          }
        );
      });
    });
    describe('stopSession', () => {
      it('notify session aware components', async () => {
        const sut = createJestExt();
        await sut.stopSession();
        expect(mockProcessSession.stop).toHaveBeenCalled();
      });
      it('updatae statusBar status', async () => {
        const sut = createJestExt();
        const mockUpdateStatusBar = jest.spyOn(sut as any, 'updateStatusBar');
        await sut.stopSession();
        expect(mockUpdateStatusBar).toHaveBeenCalledWith({ state: 'stopped' });
      });
      it('if failed to stop session, show error', async () => {
        mockProcessSession.stop.mockReturnValueOnce(Promise.reject('forced error'));
        const sut = createJestExt();
        await sut.stopSession();
        expect(messaging.systemErrorMessage).toBeCalled();
      });
    });
  });

  describe('_updateCoverageMap', () => {
    it('the overlay and codeLens will be updated when map updated async', async () => {
      expect.hasAssertions();
      (CoverageMapProvider as jest.Mock<any>).mockImplementation(() => ({
        update: () => Promise.resolve(),
      }));
      const coverageCodeLensProvider: any = { coverageChanged: jest.fn() };
      const sut = newJestExt({ coverageCodeLensProvider });
      await sut._updateCoverageMap({});
      expect(coverageCodeLensProvider.coverageChanged).toBeCalled();
      expect(sut.coverageOverlay.updateVisibleEditors).toBeCalled();
    });
  });
  describe('runAllTests', () => {
    it('can run all test for the workspace', () => {
      const sut = newJestExt();
      sut.runAllTests();
      expect(mockProcessSession.scheduleProcess).toBeCalledWith({ type: 'all-tests' });
    });
    it('can run all test for the given editor', () => {
      const sut = newJestExt();
      const editor: any = { document: { fileName: 'whatever' } };
      sut.runAllTests(editor);
      expect(mockProcessSession.scheduleProcess).toBeCalledWith({
        type: 'by-file',
        testFileNamePattern: 'whatever',
      });
    });
  });
  describe('refresh test file list upon file system change', () => {
    const getProcessType = () => {
      const { type } = mockProcessSession.scheduleProcess.mock.calls[0][0];
      return type;
    };
    let jestExt: any;
    beforeEach(() => {
      jestExt = newJestExt();
    });
    it('when new file is created', () => {
      jestExt.onDidCreateFiles({});
      expect(mockProcessSession.scheduleProcess).toHaveBeenCalledTimes(1);
      expect(getProcessType()).toEqual('list-test-files');
    });
    it('when file is renamed', () => {
      jestExt.onDidRenameFiles({});
      expect(mockProcessSession.scheduleProcess).toHaveBeenCalledTimes(1);
      expect(getProcessType()).toEqual('list-test-files');
    });
    it('when file is deleted', () => {
      jestExt.onDidDeleteFiles({});
      expect(mockProcessSession.scheduleProcess).toHaveBeenCalledTimes(1);
      expect(getProcessType()).toEqual('list-test-files');
    });
  });
  describe('triggerUpdateSettings', () => {
    it('should create a new ProcessSession', async () => {
      const jestExt = newJestExt();
      expect(createProcessSession).toBeCalledTimes(1);
      const settings: any = {
        debugMode: true,
      };
      await jestExt.triggerUpdateSettings(settings);
      expect(createProcessSession).toBeCalledTimes(2);
      expect(createProcessSession).toHaveBeenLastCalledWith(
        expect.objectContaining({ settings: { debugMode: true } })
      );
    });
  });
  describe('can handle test run results', () => {
    let sut;
    let updateWithData;
    const mockCoverageMapProvider = { update: jest.fn() };
    beforeEach(() => {
      (CoverageMapProvider as jest.Mock<any>).mockReturnValueOnce(mockCoverageMapProvider);
      mockCoverageMapProvider.update.mockImplementation(() => Promise.resolve());

      sut = newJestExt();
      const { updateWithData: f } = (createProcessSession as jest.Mocked<any>).mock.calls[0][0];
      updateWithData = f;

      (resultsWithLowerCaseWindowsDriveLetters as jest.Mocked<any>).mockReturnValue({
        coverageMap: {},
      });
    });
    it('will invoke internal components to process test results', () => {
      updateWithData({});
      expect(mockCoverageMapProvider.update).toBeCalled();
      expect(sut.testResultProvider.updateTestResults).toBeCalled();
      expect(updateDiagnostics).toBeCalled();
    });

    it('will calculate stats and update statusBar', () => {
      const updateStatusBarSpy = jest.spyOn(sut as any, 'updateStatusBar');
      updateWithData({});
      expect(sut.testResultProvider.getTestSuiteStats).toBeCalled();
      expect(updateStatusBarSpy).toBeCalled();
    });
    it('will update visible editors for the current workspace', () => {
      (vscode.window.visibleTextEditors as any) = [
        mockEditor('a'),
        mockEditor('b'),
        mockEditor('c'),
      ];
      (vscode.workspace.getWorkspaceFolder as jest.Mocked<any>).mockImplementation((uri) =>
        uri !== 'b' ? workspaceFolder : undefined
      );
      const triggerUpdateActiveEditorSpy = jest.spyOn(sut as any, 'triggerUpdateActiveEditor');
      updateWithData();
      expect(triggerUpdateActiveEditorSpy).toBeCalledTimes(2);
    });
  });

  describe('deactivate', () => {
    it('will stop session and output channel', () => {
      const sut = newJestExt();
      sut.deactivate();
      expect(mockProcessSession.stop).toBeCalledTimes(1);
      expect(channelStub.dispose).toBeCalledTimes(1);
    });
  });
});
