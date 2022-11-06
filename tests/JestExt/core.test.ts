jest.unmock('events');
jest.unmock('../../src/JestExt/core');
jest.unmock('../../src/JestExt/helper');
jest.unmock('../../src/JestExt/auto-run');
jest.unmock('../../src/appGlobals');
jest.unmock('../../src/errors');
jest.unmock('../test-helper');

jest.mock('../../src/DebugCodeLens', () => ({
  DebugCodeLensProvider: class MockCodeLensProvider {},
}));
const mockPlatform = jest.fn();
const mockRelease = jest.fn();
mockRelease.mockReturnValue('');
jest.mock('os', () => ({ platform: mockPlatform, release: mockRelease }));

const sbUpdateMock = jest.fn();
const statusBar = {
  bind: () => ({
    update: sbUpdateMock,
  }),
};
jest.mock('../../src/StatusBar', () => ({ statusBar }));
jest.mock('jest-editor-support');

import * as vscode from 'vscode';
import { JestExt } from '../../src/JestExt/core';
import { AutoRun } from '../../src/JestExt/auto-run';
import { createProcessSession } from '../../src/JestExt/process-session';
import { updateCurrentDiagnostics, updateDiagnostics } from '../../src/diagnostics';
import { CoverageMapProvider } from '../../src/Coverage';
import * as helper from '../../src/helpers';
import { TestIdentifier, resultsWithLowerCaseWindowsDriveLetters } from '../../src/TestResults';
import * as messaging from '../../src/messaging';
import { PluginResourceSettings } from '../../src/Settings';
import * as extHelper from '../..//src/JestExt/helper';
import { workspaceLogging } from '../../src/logging';
import { ProjectWorkspace } from 'jest-editor-support';
import { mockProjectWorkspace, mockWworkspaceLogging } from '../test-helper';
import { JestTestProvider } from '../../src/test-provider';
import { MessageAction } from '../../src/messaging';
import { addFolderToDisabledWorkspaceFolders } from '../../src/extensionManager';
import { JestOutputTerminal } from '../../src/JestExt/output-terminal';
import * as errors from '../../src/errors';

/* eslint jest/expect-expect: ["error", { "assertFunctionNames": ["expect", "expectItTakesNoAction"] }] */
const mockHelpers = helper as jest.Mocked<any>;
const mockOutputTerminal = {
  write: jest.fn(),
  show: jest.fn(),
  dispose: jest.fn(),
};

const EmptySortedResult = {
  fail: [],
  skip: [],
  success: [],
  unknown: [],
};
const mockGetExtensionResourceSettings = jest.spyOn(extHelper, 'getExtensionResourceSettings');

describe('JestExt', () => {
  const getConfiguration = vscode.workspace.getConfiguration as jest.Mock<any>;
  const context: any = { asAbsolutePath: (text) => text } as vscode.ExtensionContext;
  const workspaceFolder = { name: 'test-folder', uri: { fsPath: '/test-folder' } } as any;

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
    const extensionSettings = {
      debugCodeLens: {},
      testExplorer: { enabled: true },
      autoRun: { watch: true },
    } as any;
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

  const mockTestProvider: any = {
    dispose: jest.fn(),
  };

  beforeEach(() => {
    jest.resetAllMocks();

    getConfiguration.mockReturnValue({});

    (createProcessSession as jest.Mocked<any>).mockReturnValue(mockProcessSession);
    (ProjectWorkspace as jest.Mocked<any>).mockImplementation(mockProjectWorkspace);
    (workspaceLogging as jest.Mocked<any>).mockImplementation(mockWworkspaceLogging);
    (JestTestProvider as jest.Mocked<any>).mockImplementation(() => mockTestProvider);
    (JestOutputTerminal as jest.Mocked<any>).mockImplementation(() => mockOutputTerminal);
    (vscode.EventEmitter as jest.Mocked<any>) = jest.fn().mockImplementation(() => {
      return { fire: jest.fn(), event: jest.fn(), dispose: jest.fn() };
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
      startDebugging = vscode.debug.startDebugging as unknown as jest.Mock<{}>;
      (startDebugging as unknown as jest.Mock<{}>).mockImplementation(
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
    describe('should run the supplied test', () => {
      it.each([[document], ['fileName']])('support document paramter: %s', async (doc) => {
        const testNamePattern = 'testNamePattern';
        await sut.debugTests(doc, testNamePattern);
        expect(vscode.debug.startDebugging).toHaveBeenCalledWith(
          workspaceFolder,
          debugConfiguration
        );
        const configuration = startDebugging.mock.calls[startDebugging.mock.calls.length - 1][1];
        expect(configuration).toBeDefined();
        expect(configuration.type).toBe('dummyconfig');
        expect(sut.debugConfigurationProvider.prepareTestRun).toHaveBeenCalledWith(
          fileName,
          testNamePattern
        );
      });
    });
    it('can handle testIdentifier argument', async () => {
      const tId = makeIdentifier('test-1', ['d-1', 'd-1-1']);
      const fullName = 'd-1 d-1-1 test-1';
      mockHelpers.testIdString.mockReturnValue(fullName);
      await sut.debugTests(document, tId);
      expect(vscode.debug.startDebugging).toHaveBeenCalledWith(workspaceFolder, debugConfiguration);
      const configuration = startDebugging.mock.calls[startDebugging.mock.calls.length - 1][1];
      expect(configuration).toBeDefined();
      expect(configuration.type).toBe('dummyconfig');
      // test identifier is cleaned up before debug
      expect(mockHelpers.testIdString).toHaveBeenCalledWith('full-name', tId);
      expect(sut.debugConfigurationProvider.prepareTestRun).toHaveBeenCalledWith(
        fileName,
        fullName
      );
    });
    it.each`
      desc                      | testIds                                | testIdStringCount | startDebug
      ${'no id'}                | ${undefined}                           | ${0}              | ${true}
      ${'empty id'}             | ${[]}                                  | ${0}              | ${true}
      ${'1 string id '}         | ${['test-1']}                          | ${0}              | ${true}
      ${'1 testIdentifier id '} | ${[makeIdentifier('test-1', ['d-1'])]} | ${1}              | ${true}
    `('no selection needed: $desc', async ({ testIds, testIdStringCount, startDebug }) => {
      if (testIds) {
        await sut.debugTests(document, ...testIds);
      } else {
        await sut.debugTests(document);
      }
      expect(mockShowQuickPick).not.toHaveBeenCalled();
      expect(mockHelpers.testIdString).toHaveBeenCalledTimes(testIdStringCount);
      if (testIdStringCount >= 1) {
        expect(mockHelpers.testIdString).toHaveBeenLastCalledWith('full-name', testIds[0]);
        expect(mockHelpers.escapeRegExp).toHaveBeenCalled();
      }
      if (startDebug) {
        expect(vscode.debug.startDebugging).toHaveBeenCalledWith(
          workspaceFolder,
          debugConfiguration
        );
        const configuration = startDebugging.mock.calls[startDebugging.mock.calls.length - 1][1];
        expect(configuration).toBeDefined();
        expect(configuration.type).toBe('dummyconfig');
        if (testIds?.length === 1) {
          expect(sut.debugConfigurationProvider.prepareTestRun).toHaveBeenCalledWith(
            document.fileName,
            testIds[0]
          );
        } else {
          expect(sut.debugConfigurationProvider.prepareTestRun).toHaveBeenCalledWith(
            document.fileName,
            '.*'
          );
        }
        expect(sut.debugConfigurationProvider.prepareTestRun).toHaveBeenCalled();
      } else {
        expect(sut.debugConfigurationProvider.prepareTestRun).not.toHaveBeenCalled();
        expect(vscode.debug.startDebugging).not.toHaveBeenCalled();
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
            expect(mockHelpers.testIdString).toHaveBeenCalledTimes(identifierIdCount + 1);
            const calls = mockHelpers.testIdString.mock.calls;
            expect(
              calls.slice(0, identifierIdCount).every((c) => c[0] === 'display-reverse')
            ).toBeTruthy();
            expect(calls[calls.length - 1][0]).toEqual('full-name');
          };
          const hasNoId = () => {
            expect(mockHelpers.testIdString).toHaveBeenCalledTimes(0);
          };
          if (identifierIdCount) {
            hasIds();
          } else {
            hasNoId();
          }
          const selected = [tId1, tId2, tId3][selectIdx];
          expect(mockHelpers.escapeRegExp).toHaveBeenCalledWith(selected);
          // verify the actual test to be run is the one we selected: tId2
          expect(vscode.debug.startDebugging).toHaveBeenCalledWith(
            workspaceFolder,
            debugConfiguration
          );
          const configuration = startDebugging.mock.calls[startDebugging.mock.calls.length - 1][1];
          expect(configuration).toBeDefined();
          expect(configuration.type).toBe('dummyconfig');
          expect(sut.debugConfigurationProvider.prepareTestRun).toHaveBeenCalledWith(
            fileName,
            selected
          );
        });
        it('if user did not choose any test, no debug will be run', async () => {
          selectIdx = -1;
          await sut.debugTests(document, tId1, tId2, tId3);
          expect(mockShowQuickPick).toHaveBeenCalledTimes(1);
          expect(vscode.debug.startDebugging).not.toHaveBeenCalled();
        });
        it('if pass zero testId, all tests will be run', async () => {
          await sut.debugTests(document);
          expect(mockShowQuickPick).not.toHaveBeenCalled();
          expect(mockHelpers.testIdString).not.toHaveBeenCalled();
          expect(sut.debugConfigurationProvider.prepareTestRun).toHaveBeenCalledWith(
            document.fileName,
            '.*'
          );
          expect(vscode.debug.startDebugging).toHaveBeenCalled();
        });
      });
    });
    it.each`
      configNames                           | useDefaultConfig | debugMode | v2
      ${undefined}                          | ${true}          | ${true}   | ${false}
      ${[]}                                 | ${true}          | ${true}   | ${false}
      ${['a', 'b']}                         | ${true}          | ${false}  | ${false}
      ${['a', 'vscode-jest-tests.v2', 'b']} | ${false}         | ${false}  | ${true}
      ${['a', 'vscode-jest-tests', 'b']}    | ${false}         | ${false}  | ${false}
    `(
      'will find appropriate debug config: $configNames',
      async ({ configNames, useDefaultConfig, debugMode, v2 }) => {
        expect.hasAssertions();
        const testNamePattern = 'testNamePattern';
        mockConfigurations = configNames ? configNames.map((name) => ({ name })) : undefined;

        // mockProjectWorkspace.debug = debugMode;
        sut = newJestExt({ settings: { debugMode } });

        await sut.debugTests(document, testNamePattern);

        expect(startDebugging).toHaveBeenCalledTimes(1);
        if (useDefaultConfig) {
          // debug with generated config
          expect(vscode.debug.startDebugging).toHaveBeenLastCalledWith(
            workspaceFolder,
            debugConfiguration
          );
        } else {
          // debug with existing config
          expect(vscode.debug.startDebugging).toHaveBeenLastCalledWith(workspaceFolder, {
            name: v2 ? 'vscode-jest-tests.v2' : 'vscode-jest-tests',
          });
        }

        expect(sut.debugConfigurationProvider.prepareTestRun).toHaveBeenCalledWith(
          fileName,
          testNamePattern
        );

        expect(messaging.systemWarningMessage).not.toHaveBeenCalled();
      }
    );
    describe('can fallback to workspace config if no folder config found', () => {
      const defaultConfig = { name: 'vscode-jest-tests.v2' };
      const v1Config = { name: 'vscode-jest-tests' };
      const v2Config = { name: 'vscode-jest-tests.v2' };
      const notJestConfig = { name: 'not-for-jest' };
      it.each`
        case | folderConfigs      | workspaceConfigs        | expectedConfig
        ${1} | ${undefined}       | ${undefined}            | ${defaultConfig}
        ${2} | ${[notJestConfig]} | ${[v1Config, v2Config]} | ${v2Config}
        ${3} | ${[v1Config]}      | ${[v2Config]}           | ${v1Config}
        ${4} | ${undefined}       | ${[v2Config]}           | ${v2Config}
        ${5} | ${[v2Config]}      | ${[]}                   | ${v2Config}
      `('case $case', ({ folderConfigs, workspaceConfigs, expectedConfig }) => {
        debugConfigurationProvider.provideDebugConfigurations.mockReturnValue([defaultConfig]);
        vscode.workspace.getConfiguration = jest.fn().mockImplementation((section, scope) => {
          return {
            get: () => {
              if (section !== 'launch') {
                return;
              }
              if (scope === workspaceFolder.ui) {
                return folderConfigs;
              }
              if (!scope) {
                return workspaceConfigs;
              }
            },
          };
        });
        sut = newJestExt();
        sut.debugTests(document, 'testNamePattern');
        expect(vscode.debug.startDebugging).toHaveBeenCalledWith(workspaceFolder, expectedConfig);
      });
    });
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
      expect(sut.removeCachedTestResults).toHaveBeenCalledWith(document);
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
      expect(sut.testResultProvider.removeCachedResults).not.toHaveBeenCalled();
    });

    it('should do nothing when the document is untitled', () => {
      const document: any = { isUntitled: true } as any;
      sut.removeCachedTestResults(document);

      expect(sut.testResultProvider.removeCachedResults).not.toHaveBeenCalled();
    });

    it('should reset the test result cache for the document', () => {
      const expected = 'file.js';
      sut.removeCachedTestResults({ fileName: expected } as any);

      expect(sut.testResultProvider.removeCachedResults).toHaveBeenCalledWith(expected);
    });
    it('can invalidate test results', () => {
      const expected = 'file.js';
      sut.removeCachedTestResults({ fileName: expected } as any, true);

      expect(sut.testResultProvider.removeCachedResults).not.toHaveBeenCalled();
      expect(sut.testResultProvider.invalidateTestResults).toHaveBeenCalledWith(expected);
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
      editor.document = {};
      sut.onDidChangeActiveTextEditor(editor);

      expect(sut.triggerUpdateActiveEditor).toHaveBeenCalledWith(editor);
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

      expect(sut.removeCachedTestResults).not.toHaveBeenCalledWith(event.document);
      expect(sut.triggerUpdateActiveEditor).not.toHaveBeenCalled();
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
      vscode.window.visibleTextEditors = [editor];
      sut.onDidChangeTextDocument(event);

      expect(sut.triggerUpdateActiveEditor).toHaveBeenCalledWith(editor);
    });
    it('should update statusBar for stats', () => {
      sut.onDidChangeTextDocument(event);

      expect(sut.testResultProvider.getTestSuiteStats).toHaveBeenCalled();
      expect(sbUpdateMock).toHaveBeenCalled();
    });
  });

  describe('onWillSaveTextDocument', () => {
    it.each([[true], [false]])(
      'ony invalidate test status if document is dirty: isDirty=%d',
      (isDirty) => {
        vscode.window.visibleTextEditors = [];
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
          expect(sut.testResultProvider.invalidateTestResults).toHaveBeenCalled();
        } else {
          expect(sut.testResultProvider.invalidateTestResults).not.toHaveBeenCalled();
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
        ${{ watch: false, onSave: 'test-src-file' }} | ${'javascript'} | ${'unknown'} | ${true}        | ${false}
        ${{ watch: false, onSave: 'test-src-file' }} | ${'javascript'} | ${'yes'}     | ${true}        | ${false}
        ${{ watch: false, onSave: 'test-src-file' }} | ${'json'}       | ${'no'}      | ${false}       | ${false}
        ${{ watch: false, onSave: 'test-file' }}     | ${'javascript'} | ${'no'}      | ${false}       | ${true}
        ${{ watch: false, onSave: 'test-file' }}     | ${'javascript'} | ${'unknown'} | ${true}        | ${false}
        ${{ watch: false, onSave: 'test-file' }}     | ${'javascript'} | ${'yes'}     | ${true}        | ${false}
        ${{ watch: false, onSave: 'test-file' }}     | ${'javascript'} | ${'unknown'} | ${true}        | ${false}
        ${{ watch: false, onSave: 'test-file' }}     | ${'json'}       | ${'unknown'} | ${false}       | ${false}
      `(
        'with autoRun: $runConfig $languageId $isTestFile => $shouldSchedule, $isDirty',
        ({ runConfig, languageId, isTestFile, shouldSchedule, isDirty }) => {
          const sut: any = newJestExt({ settings: { autoRun: new AutoRun(runConfig) } });
          const fileName = '/a/file;';
          const document: any = {
            uri: { scheme: 'file' },
            languageId: languageId,
            fileName,
          };

          vscode.window.visibleTextEditors = [];

          (sut.testResultProvider.isTestFile as jest.Mocked<any>).mockReturnValueOnce(isTestFile);
          mockProcessSession.scheduleProcess.mockClear();

          sut.onDidSaveTextDocument(document);

          if (shouldSchedule) {
            expect(mockProcessSession.scheduleProcess).toHaveBeenCalledWith(
              expect.objectContaining({
                type: 'by-file',
                testFileName: fileName,
                notTestFile: isTestFile !== 'yes',
              })
            );
          } else {
            expect(mockProcessSession.scheduleProcess).not.toHaveBeenCalled();
          }
          expect(sbUpdateMock).toHaveBeenCalledWith(
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

      expect(sut.coverageOverlay.toggleVisibility).toHaveBeenCalled();
      expect(sut.triggerUpdateSettings).toHaveBeenCalled();
    });
    it('overrides showCoverageOnLoad settings', async () => {
      const settings = { showCoverageOnLoad: true } as any;
      const sut = newJestExt({ settings });

      const { createRunnerWorkspace } = (createProcessSession as jest.Mocked<any>).mock.calls[0][0];
      let runnerWorkspace = createRunnerWorkspace();
      expect(runnerWorkspace.collectCoverage).toBe(true);

      sut.coverageOverlay.enabled = false;
      await sut.toggleCoverageOverlay();

      const { createRunnerWorkspace: f2, settings: settings2 } = (
        createProcessSession as jest.Mocked<any>
      ).mock.calls[1][0];
      runnerWorkspace = f2();
      expect(settings2.showCoverageOnLoad).toBe(false);
      expect(runnerWorkspace.collectCoverage).toBe(false);
    });
  });

  describe('triggerUpdateActiveEditor()', () => {
    it('should update the coverage overlay in visible editors', () => {
      const editor: any = {};

      const sut = newJestExt();
      sut.triggerUpdateActiveEditor(editor);

      expect(sut.coverageOverlay.updateVisibleEditors).toHaveBeenCalled();
    });
    it('should update both decorators and diagnostics for valid editor', () => {
      const sut = newJestExt();
      sut.updateDecorators = jest.fn();
      const editor = mockEditor('file://a/b/c.ts');

      (sut.testResultProvider.getSortedResults as unknown as jest.Mock<{}>).mockReturnValueOnce({
        success: [],
        fail: [],
        skip: [],
        unknown: [],
      });
      sut.triggerUpdateActiveEditor(editor);

      expect(sut.updateDecorators).toHaveBeenCalled();
      expect(updateCurrentDiagnostics).toHaveBeenCalled();
    });
    it.each`
      autoRun                                                  | isInteractive
      ${'off'}                                                 | ${true}
      ${{ watch: true }}                                       | ${true}
      ${{ watch: false }}                                      | ${true}
      ${{ onStartup: ['all-tests'] }}                          | ${true}
      ${{ onSave: 'test-file' }}                               | ${true}
      ${{ onSave: 'test-src-file' }}                           | ${true}
      ${{ onSave: 'test-src-file', onStartup: ['all-tests'] }} | ${true}
    `('should update vscode editor context', ({ autoRun, isInteractive }) => {
      const sut = newJestExt({ settings: { autoRun } });
      const editor = mockEditor('a');
      sut.triggerUpdateActiveEditor(editor);
      expect(vscode.commands.executeCommand).toHaveBeenCalledWith(
        'setContext',
        'jest:run.interactive',
        isInteractive
      );
    });
    it('when failed to get test result, it should report error and clear the decorators and diagnostics', () => {
      const sut = newJestExt();
      sut.debugCodeLensProvider.didChange = jest.fn();
      const editor = mockEditor('a');
      (sut.testResultProvider.getSortedResults as jest.Mocked<any>).mockImplementation(() => {
        throw new Error('force error');
      });
      const updateDecoratorsSpy = jest.spyOn(sut, 'updateDecorators');

      sut.triggerUpdateActiveEditor(editor);
      expect(mockOutputTerminal.write).toHaveBeenCalledWith(
        expect.stringContaining('force error'),
        'error'
      );

      expect(updateDecoratorsSpy).toHaveBeenCalled();
      expect(updateCurrentDiagnostics).toHaveBeenCalledWith(
        EmptySortedResult.fail,
        undefined,
        editor
      );
    });
    describe('can skip non test-file related updates', () => {
      let sut;
      let updateDecoratorsSpy;
      beforeEach(() => {
        sut = newJestExt();
        (sut.testResultProvider.getSortedResults as unknown as jest.Mock<{}>).mockReturnValueOnce({
          success: [],
          fail: [],
          skip: [],
          unknown: [],
        });
        updateDecoratorsSpy = jest.spyOn(sut, 'updateDecorators');
        sut.debugCodeLensProvider.didChange = jest.fn();
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
        ${'vue'}             | ${false}
      `('if languageId=languageId => skip? $shouldSkip', ({ languageId, shouldSkip }) => {
        const editor = mockEditor('file', languageId);
        sut.triggerUpdateActiveEditor(editor);
        if (shouldSkip) {
          expect(updateCurrentDiagnostics).not.toHaveBeenCalled();
          expect(updateDecoratorsSpy).not.toHaveBeenCalled();
        } else {
          expect(updateCurrentDiagnostics).toHaveBeenCalled();
          expect(updateDecoratorsSpy).toHaveBeenCalled();
        }
      });
      it('if editor has no document', () => {
        const editor = {};
        sut.triggerUpdateActiveEditor(editor);
        expect(updateCurrentDiagnostics).not.toHaveBeenCalled();
        expect(updateDecoratorsSpy).not.toHaveBeenCalled();
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
            expect(updateCurrentDiagnostics).toHaveBeenCalled();
            expect(updateDecoratorsSpy).toHaveBeenCalled();
          } else {
            expect(updateCurrentDiagnostics).not.toHaveBeenCalled();
            expect(updateDecoratorsSpy).not.toHaveBeenCalled();
          }
        }
      );
    });
  });

  describe('session', () => {
    const createJestExt = () => {
      const jestExt: any = newJestExt();

      return jestExt;
    };
    beforeEach(() => {});
    describe('startSession', () => {
      it('starts a new session and file event', async () => {
        const sut = createJestExt();
        await sut.startSession();
        expect(mockProcessSession.start).toHaveBeenCalled();
        expect(JestTestProvider).toHaveBeenCalled();

        expect(sut.events.onTestSessionStarted.fire).toHaveBeenCalledWith(
          expect.objectContaining({ session: mockProcessSession })
        );
      });
      it('if failed to start session, show error', async () => {
        mockProcessSession.start.mockReturnValueOnce(Promise.reject('forced error'));
        const sut = createJestExt();
        await sut.startSession();
        expect(messaging.systemErrorMessage).toHaveBeenCalled();
      });
      it('dispose existing jestProvider before creating new one', async () => {
        expect.hasAssertions();
        const sut = createJestExt();
        await sut.startSession();
        expect(JestTestProvider).toHaveBeenCalledTimes(1);

        await sut.startSession();
        expect(mockTestProvider.dispose).toHaveBeenCalledTimes(1);
        expect(JestTestProvider).toHaveBeenCalledTimes(2);
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
            const stats = { success: 1000, isDirty: false };
            sut.testResultProvider.getTestSuiteStats = jest.fn().mockReturnValueOnce(stats);

            await sut.startSession();

            expect(mockProcessSession.scheduleProcess).toHaveBeenCalledTimes(1);
            const { type, onResult } = mockProcessSession.scheduleProcess.mock.calls[0][0];
            expect(type).toEqual('list-test-files');
            expect(onResult).not.toBeUndefined();

            onResult(fileNames, error);
            expect(sut.testResultProvider.updateTestFileList).toHaveBeenCalledWith(
              expectedTestFiles
            );

            // stats will be updated in status baar accordingly
            expect(sut.testResultProvider.getTestSuiteStats).toHaveBeenCalled();
            expect(sbUpdateMock).toHaveBeenCalledWith({ stats });
          }
        );
      });
    });
    describe('stopSession', () => {
      it('will fire event', async () => {
        const sut = createJestExt();
        await sut.stopSession();
        expect(mockProcessSession.stop).toHaveBeenCalled();
        expect(sut.events.onTestSessionStopped.fire).toHaveBeenCalled();
      });
      it('dispose existing testProvider', async () => {
        const sut = createJestExt();
        await sut.startSession();
        expect(JestTestProvider).toHaveBeenCalledTimes(1);

        await sut.stopSession();
        expect(mockTestProvider.dispose).toHaveBeenCalledTimes(1);
        expect(JestTestProvider).toHaveBeenCalledTimes(1);
      });
      it('updatae statusBar status', async () => {
        const sut = createJestExt();
        await sut.stopSession();
        expect(sbUpdateMock).toHaveBeenCalledWith({ state: 'stopped' });
      });
      it('if failed to stop session, show error', async () => {
        mockProcessSession.stop.mockReturnValueOnce(Promise.reject('forced error'));
        const sut = createJestExt();
        await sut.stopSession();
        expect(messaging.systemErrorMessage).toHaveBeenCalled();
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
      expect(coverageCodeLensProvider.coverageChanged).toHaveBeenCalled();
      expect(sut.coverageOverlay.updateVisibleEditors).toHaveBeenCalled();
    });
  });
  describe('runAllTests', () => {
    describe.each`
      scheduleProcess
      ${{}}
      ${undefined}
    `('scheduleProcess returns $scheduleProcess', ({ scheduleProcess }) => {
      beforeEach(() => {
        mockProcessSession.scheduleProcess.mockReturnValueOnce(scheduleProcess);
      });
      it('can run all test for the workspace', () => {
        const sut = newJestExt();
        const dirtyFiles: any = sut['dirtyFiles'];
        dirtyFiles.clear = jest.fn();

        sut.runAllTests();
        expect(mockProcessSession.scheduleProcess).toHaveBeenCalledWith({ type: 'all-tests' });
        if (scheduleProcess) {
          expect(dirtyFiles.clear).toHaveBeenCalled();
        } else {
          expect(dirtyFiles.clear).not.toHaveBeenCalled();
        }
      });
      it('can run all test for the given editor', () => {
        const sut = newJestExt();

        const dirtyFiles: any = sut['dirtyFiles'];
        dirtyFiles.delete = jest.fn();

        const editor: any = { document: { fileName: 'whatever' } };

        sut.runAllTests(editor);
        expect(mockProcessSession.scheduleProcess).toHaveBeenCalledWith({
          type: 'by-file',
          testFileName: editor.document.fileName,
          notTestFile: true,
        });
        if (scheduleProcess) {
          expect(dirtyFiles.delete).toHaveBeenCalledWith(editor.document.fileName);
        } else {
          expect(dirtyFiles.delete).not.toHaveBeenCalled();
        }
      });
    });
    it.each`
      isTestFile   | notTestFile
      ${'yes'}     | ${false}
      ${'no'}      | ${true}
      ${'unknown'} | ${true}
    `(
      'treat unknown as notTestFile: isTestFile=$isTestFile => notTestFile=$notTestFile',
      ({ isTestFile, notTestFile }) => {
        const sut = newJestExt();
        const editor: any = { document: { fileName: 'whatever' } };

        (sut.testResultProvider.isTestFile as jest.Mocked<any>).mockReturnValueOnce(isTestFile);

        sut.runAllTests(editor);
        if (notTestFile) {
          expect(mockProcessSession.scheduleProcess).toHaveBeenCalledWith({
            type: 'by-file',
            testFileName: editor.document.fileName,
            notTestFile: true,
          });
        } else {
          expect(mockProcessSession.scheduleProcess).toHaveBeenCalledWith({
            type: 'by-file-pattern',
            testFileNamePattern: editor.document.fileName,
          });
        }
      }
    );
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
      expect(createProcessSession).toHaveBeenCalledTimes(1);
      const settings: any = {
        debugMode: true,
        autoRun: { watch: true },
      };
      await jestExt.triggerUpdateSettings(settings);
      expect(createProcessSession).toHaveBeenCalledTimes(2);
      expect(createProcessSession).toHaveBeenLastCalledWith(expect.objectContaining({ settings }));
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
      updateWithData({}, 'test-all-12');
      expect(mockCoverageMapProvider.update).toHaveBeenCalled();
      expect(sut.testResultProvider.updateTestResults).toHaveBeenCalledWith(
        expect.anything(),
        'test-all-12'
      );
      expect(updateDiagnostics).toHaveBeenCalled();
    });

    it('will calculate stats and update statusBar', () => {
      updateWithData({});
      expect(sut.testResultProvider.getTestSuiteStats).toHaveBeenCalled();
      expect(sbUpdateMock).toHaveBeenCalled();
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
      expect(triggerUpdateActiveEditorSpy).toHaveBeenCalledTimes(2);
    });
  });

  describe('deactivate', () => {
    it('will stop session and output channel', () => {
      const sut = newJestExt();
      sut.deactivate();
      expect(mockProcessSession.stop).toHaveBeenCalledTimes(1);
      expect(mockOutputTerminal.dispose).toHaveBeenCalledTimes(1);
    });
    it('will dispose test provider if initialized', () => {
      const sut = newJestExt();
      sut.deactivate();
      expect(mockTestProvider.dispose).not.toHaveBeenCalledTimes(1);
      sut.startSession();
      sut.deactivate();
      expect(mockTestProvider.dispose).toHaveBeenCalledTimes(1);
    });
    it('will dispose all events', () => {
      const sut = newJestExt();
      sut.deactivate();
      expect(sut.events.onRunEvent.dispose).toHaveBeenCalled();
      expect(sut.events.onTestSessionStarted.dispose).toHaveBeenCalled();
      expect(sut.events.onTestSessionStopped.dispose).toHaveBeenCalled();
    });
  });
  describe('activate', () => {
    it('will invoke onDidChangeActiveTextEditor for activeTextEditor', () => {
      const sut = newJestExt();
      const spy = jest.spyOn(sut, 'onDidChangeActiveTextEditor').mockImplementation(() => {});
      vscode.window.activeTextEditor = undefined;

      sut.activate();
      expect(spy).not.toHaveBeenCalled();

      (vscode.window.activeTextEditor as any) = {
        document: { uri: 'whatever' },
      };
      (vscode.workspace.getWorkspaceFolder as jest.Mocked<any>).mockReturnValue(workspaceFolder);

      sut.activate();
      expect(spy).toHaveBeenCalled();
    });
  });
  describe('runEvents', () => {
    let sut, onRunEvent, process;
    beforeEach(() => {
      sut = newJestExt();
      onRunEvent = (sut.events.onRunEvent.event as jest.Mocked<any>).mock.calls[0][0];
      process = { id: 'a process id', request: { type: 'watch' } };
      sbUpdateMock.mockClear();
    });

    describe('can process run events', () => {
      it('register onRunEvent listener', () => {
        expect(sut.events.onRunEvent.event).toHaveBeenCalledTimes(1);
      });
      it('will not process not testing process events', () => {
        process.request.type = 'not-test';
        onRunEvent({ type: 'start', process });
        expect(sbUpdateMock).not.toHaveBeenCalled();
      });
      it('start event: notify status bar', () => {
        onRunEvent({ type: 'start', process });
        expect(sbUpdateMock).toHaveBeenCalledWith({ state: 'running' });
      });
      it('end event: notify status bar', () => {
        onRunEvent({ type: 'end', process });
        expect(sbUpdateMock).toHaveBeenCalledWith({ state: 'done' });
      });
      describe('exit event: notify status bar', () => {
        it('if no error: status bar done', () => {
          onRunEvent({ type: 'exit', process });
          expect(sbUpdateMock).toHaveBeenCalledWith({ state: 'done' });
        });
        it('if error: status bar stopped and show error', () => {
          onRunEvent({ type: 'exit', error: 'something is wrong', process });
          expect(sbUpdateMock).toHaveBeenCalledWith({ state: 'stopped' });
          expect(messaging.systemErrorMessage).toHaveBeenCalledWith(
            'something is wrong',
            { action: expect.any(Function), title: 'Help' },
            { action: expect.any(Function), title: 'Run Setup Tool' }
          );
          const setupAction: MessageAction = (messaging.systemErrorMessage as jest.Mocked<any>).mock
            .calls[0][2];

          setupAction.action();

          expect(vscode.commands.executeCommand).toHaveBeenCalledWith(
            expect.stringContaining('setup-extension'),
            expect.objectContaining({ workspace: workspaceFolder })
          );
        });
        it('if error: status bar stopped and show error with ignore folder button', () => {
          (vscode.workspace.workspaceFolders as any) = ['testfolder1', 'testfolder'];

          onRunEvent({ type: 'exit', error: 'something is wrong', process });
          expect(sbUpdateMock).toHaveBeenCalledWith({ state: 'stopped' });
          expect(messaging.systemErrorMessage).toHaveBeenCalledWith(
            '(test-folder) something is wrong',
            { action: expect.any(Function), title: 'Help' },
            { action: expect.any(Function), title: 'Run Setup Tool' },
            { action: expect.any(Function), title: 'Ignore Folder' }
          );

          const ignoreAction: MessageAction = (messaging.systemErrorMessage as jest.Mocked<any>)
            .mock.calls[0][3];

          ignoreAction.action();

          expect(addFolderToDisabledWorkspaceFolders).toHaveBeenCalledWith('test-folder');
        });
      });
      it.each`
        numTotalTestSuites
        ${undefined}
        ${17}
      `(
        'long-run event with $numTotalTestSuites numTotalTestSuites triggers system warning',
        ({ numTotalTestSuites }) => {
          process = { ...process, request: { type: 'all-tests' } };
          onRunEvent({ type: 'long-run', numTotalTestSuites, threshold: 60000, process });
          expect(messaging.systemWarningMessage).toHaveBeenCalledTimes(1);
          const msg = (messaging.systemWarningMessage as jest.Mocked<any>).mock.calls[0][0];
          expect(msg).toContain('all-tests');
          if (numTotalTestSuites) {
            expect(msg).toContain(`${numTotalTestSuites} suites`);
          } else {
            expect(msg).not.toContain(`${numTotalTestSuites} suites`);
          }
        }
      );
    });
    it('events are disposed when extensioin deactivated', () => {
      sut.deactivate();
      expect(sut.events.onRunEvent.dispose).toHaveBeenCalled();
    });
  });
  it.each`
    exitCode     | errorType
    ${undefined} | ${'error'}
    ${1}         | ${'error'}
    ${127}       | ${errors.CMD_NOT_FOUND}
  `(
    'updateTestFileList error will be logged to output terminal by exitCode ($exitCode)',
    async ({ exitCode, errorType }) => {
      expect.hasAssertions();
      const sut = newJestExt();

      await sut.startSession();

      expect(mockProcessSession.scheduleProcess).toHaveBeenCalledTimes(1);
      const { type, onResult } = mockProcessSession.scheduleProcess.mock.calls[0][0];
      expect(type).toEqual('list-test-files');
      expect(onResult).not.toBeUndefined();

      // when process failed
      onResult(undefined, 'process error', exitCode);
      expect(mockOutputTerminal.write).toHaveBeenCalledWith(expect.anything(), errorType);
    }
  );
  it('showOutput will show the output terminal', () => {
    const sut = newJestExt();
    sut.showOutput();
    expect(mockOutputTerminal.show).toHaveBeenCalled();
  });
  it('toggleAutoRun will trigger autoRun to toggle runtime config', () => {
    const autoRun = new AutoRun('watch');
    const sut: any = newJestExt({ settings: { autoRun } });
    expect(autoRun.isWatch).toBeTruthy();
    expect(autoRun.isOff).toBeFalsy();

    sut.toggleAutoRun();
    expect(autoRun.isWatch).toBeFalsy();
    expect(autoRun.isOff).toBeTruthy();
  });
});
