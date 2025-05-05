jest.unmock('events');
jest.unmock('../../src/JestExt/core');
jest.unmock('../../src/JestExt/helper');
jest.unmock('../../src/JestExt/run-mode');
jest.unmock('../../src/appGlobals');
jest.unmock('../../src/errors');
jest.unmock('../test-helper');

const mockPlatform = jest.fn();
const mockRelease = jest.fn();
mockRelease.mockReturnValue('');
jest.mock('os', () => ({ platform: mockPlatform, release: mockRelease }));

const sbUpdateMock = jest.fn();
const statusBar = {
  bind: () => ({
    update: sbUpdateMock,
  }),
  removeWorkspaceFolder: jest.fn(),
};
jest.mock('../../src/StatusBar', () => ({ statusBar }));
jest.mock('jest-editor-support');

const mockIsInFolder = jest.fn();
const mockWorkspaceManager = { getFoldersFromFilesystem: jest.fn() };
jest.mock('../../src/workspace-manager', () => ({
  WorkspaceManager: jest.fn().mockReturnValue(mockWorkspaceManager),
  isInFolder: mockIsInFolder,
}));
const mockOutputManager = {
  showOutputOn: jest.fn(),
  outputConfigs: jest.fn(),
};
jest.mock('../../src/output-manager', () => ({
  outputManager: mockOutputManager,
}));

import * as vscode from 'vscode';
import { JestExt } from '../../src/JestExt/core';
import { RunMode } from '../../src/JestExt/run-mode';
import { createProcessSession } from '../../src/JestExt/process-session';
import { updateCurrentDiagnostics, updateDiagnostics } from '../../src/diagnostics';
import { CoverageMapProvider } from '../../src/Coverage';
import * as helper from '../../src/helpers';
import { resultsWithLowerCaseWindowsDriveLetters } from '../../src/TestResults';
import { PluginResourceSettings } from '../../src/Settings';
import * as extHelper from '../../src/JestExt/helper';
import { workspaceLogging } from '../../src/logging';
import { ProjectWorkspace } from 'jest-editor-support';
import {
  makeUri,
  makeWorkspaceFolder,
  mockProjectWorkspace,
  mockWorkspaceLogging,
} from '../test-helper';
import { JestTestProvider } from '../../src/test-provider';
import { JestOutputTerminal } from '../../src/JestExt/output-terminal';
import { RunShell } from '../../src/JestExt/run-shell';
import * as errors from '../../src/errors';
import { ItemCommand } from '../../src/test-provider/types';
import { TestResultProvider } from '../../src/TestResults';
import { executableTerminalLinkProvider } from '../../src/terminal-link-provider';
import { updateSetting } from '../../src/Settings';

/* eslint jest/expect-expect: ["error", { "assertFunctionNames": ["expect", "expectItTakesNoAction"] }] */
const mockHelpers = helper as jest.Mocked<any>;
const mockOutputTerminal = {
  revealOnError: true,
  write: jest.fn(),
  show: jest.fn(),
  close: jest.fn(),
  dispose: jest.fn(),
  enable: jest.fn(),
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
  let mockSettings;

  const debugConfigurationProvider = {
    provideDebugConfigurations: jest.fn(),
    prepareTestRun: jest.fn(),
    createDebugConfig: jest.fn(),
    getDebugConfigNames: jest.fn(),
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
    mockSettings = { ...mockSettings, ...(override?.settings ?? {}) };
    mockGetExtensionResourceSettings.mockReturnValue(mockSettings);
    const coverageCodeLensProvider: any = override?.coverageCodeLensProvider ?? {
      coverageChanged: jest.fn(),
    };

    // Make a JestExt instance
    const jestExtInstance = new JestExt(
      context,
      workspaceFolder,
      debugConfigurationProvider,
      coverageCodeLensProvider
    );

    // Mock the new methods on testResultProvider
    jestExtInstance.testResultProvider.markTestFileListDirty = jest.fn();
    jestExtInstance.testResultProvider.isTestFileListDirty = jest.fn().mockReturnValue(false);

    return jestExtInstance;
  };
  const mockEditor = (fileName: string, languageId = 'typescript'): any => {
    return {
      document: { fileName, languageId, uri: makeUri(fileName) },
      setDecorations: jest.fn(),
    };
  };

  const mockTestProvider: any = {
    dispose: jest.fn(),
    runItemCommand: jest.fn(),
    runTests: jest.fn(),
  };

  const mockListTestFiles = (files: string[] = [], error?: string, exitCode = 0) => {
    mockProcessSession.scheduleProcess.mockImplementation((request) => {
      if (request.type === 'list-test-files') {
        return request.onResult(files, error, exitCode);
      }
    });
  };

  beforeEach(() => {
    jest.resetAllMocks();

    mockSettings = {
      debugCodeLens: {},
      testExplorer: { enabled: true },
      runMode: new RunMode(),
      jestCommandLine: 'jest',
    };
    getConfiguration.mockReturnValue({});
    mockOutputManager.outputConfigs.mockReturnValue({
      outputConfig: { value: {}, isExplicitlySet: false },
      openTesting: { value: {}, isExplicitlySet: false },
    });

    vscode.window.visibleTextEditors = [];
    (createProcessSession as jest.Mocked<any>).mockReturnValue(mockProcessSession);
    (ProjectWorkspace as jest.Mocked<any>).mockImplementation(mockProjectWorkspace);
    (workspaceLogging as jest.Mocked<any>).mockImplementation(mockWorkspaceLogging);
    (JestTestProvider as jest.Mocked<any>).mockImplementation(() => ({ ...mockTestProvider }));
    (JestOutputTerminal as jest.Mocked<any>).mockImplementation(() => mockOutputTerminal);
    (vscode.EventEmitter as jest.Mocked<any>) = jest.fn().mockImplementation(() => {
      return { fire: jest.fn(), event: jest.fn(), dispose: jest.fn() };
    });
    (RunShell as jest.Mocked<any>).mockImplementation(() => ({ toSetting: jest.fn() }));
    mockListTestFiles();
  });

  const debugConfiguration = { type: 'default-config' };
  const debugConfiguration2 = { type: 'with-setting-override' };

  describe('debugTests()', () => {
    const testPath = 'fileName';
    const document: any = { fileName: testPath };
    let sut: JestExt;
    let startDebugging;
    const mockShowQuickPick = jest.fn();
    let mockConfigurations = [];
    
    it('should update test file list if marked as dirty before debugging', async () => {
      const sut = newJestExt();
      // Mock that test file list is dirty
      (sut.testResultProvider.isTestFileListDirty as jest.Mock).mockReturnValueOnce(true);
      
      // Set up updateTestFileList to resolve immediately when called
      const updateTestFileListSpy = jest.spyOn(sut as any, 'updateTestFileList').mockResolvedValueOnce(undefined);
      
      await sut.debugTests({ testPath: document.fileName, testName: 'testName' });
      
      // Verify updateTestFileList was called before debugging
      expect(updateTestFileListSpy).toHaveBeenCalled();
      expect(sut.debugConfigurationProvider.prepareTestRun).toHaveBeenCalled();
    });
    
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
      debugConfigurationProvider.provideDebugConfigurations.mockReturnValue([debugConfiguration]);
      debugConfigurationProvider.createDebugConfig.mockReturnValue(debugConfiguration2);
      debugConfigurationProvider.getDebugConfigNames.mockImplementation((ws) => {
        const v1 = [`vscode-jest-tests.${ws.name}`, 'vscode-jest-tests'];
        const v2 = [`vscode-jest-tests.v2.${ws.name}`, 'vscode-jest-tests.v2'];
        const sorted = [...v2, ...v1];
        return { v1, v2, sorted };
      });
      vscode.window.showQuickPick = mockShowQuickPick;
      mockHelpers.escapeRegExp.mockImplementation((s) => s);
      mockHelpers.testIdString.mockImplementation((_, s) => s);

      mockConfigurations = [];
      vscode.workspace.getConfiguration = jest.fn().mockReturnValue({
        get: jest.fn(() => mockConfigurations),
      });

      sut = newJestExt();
    });
    describe('getting a debug config', () => {
      describe('use config from launch.json if available', () => {
        it.each`
          configNames                           | useDefaultConfig | debugMode | v2
          ${undefined}                          | ${true}          | ${true}   | ${false}
          ${[]}                                 | ${true}          | ${true}   | ${false}
          ${['a', 'b']}                         | ${true}          | ${false}  | ${false}
          ${['a', 'vscode-jest-tests.v2', 'b']} | ${false}         | ${false}  | ${true}
          ${['a', 'vscode-jest-tests', 'b']}    | ${false}         | ${false}  | ${false}
        `('$configNames', async ({ configNames, useDefaultConfig, debugMode, v2 }) => {
          expect.hasAssertions();
          const testName = 'testName';
          mockConfigurations = configNames ? configNames.map((name) => ({ name })) : undefined;

          // mockProjectWorkspace.debug = debugMode;
          sut = newJestExt({ settings: { debugMode } });

          const debugInfo = { testPath: document.fileName, testName };
          await sut.debugTests(debugInfo);

          expect(startDebugging).toHaveBeenCalledTimes(1);
          if (useDefaultConfig) {
            // debug with generated config
            expect(vscode.debug.startDebugging).toHaveBeenLastCalledWith(
              workspaceFolder,
              debugConfiguration2
            );
          } else {
            // debug with existing config
            expect(vscode.debug.startDebugging).toHaveBeenLastCalledWith(workspaceFolder, {
              name: v2 ? 'vscode-jest-tests.v2' : 'vscode-jest-tests',
            });
          }

          expect(sut.debugConfigurationProvider.prepareTestRun).toHaveBeenCalledWith(
            debugInfo,
            workspaceFolder,
            undefined
          );
        });
        describe('can fallback to workspace config if no folder config found', () => {
          const defaultConfig = { name: 'vscode-jest-tests.v2' };
          const v1Config = { name: 'vscode-jest-tests' };
          const v2Config = { name: 'vscode-jest-tests.v2' };
          const notJestConfig = { name: 'not-for-jest' };
          it.each`
            case | folderConfigs      | workspaceConfigs        | expectedConfig
            ${1} | ${undefined}       | ${undefined}            | ${debugConfiguration2}
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
                  if (scope === workspaceFolder) {
                    return folderConfigs;
                  }
                  if (!scope) {
                    return workspaceConfigs;
                  }
                },
              };
            });
            sut = newJestExt({ settings: { jestCommandLine: undefined } });
            sut.debugTests({ testPath: document.fileName, testName: 'testName' });
            expect(vscode.debug.startDebugging).toHaveBeenCalledWith(
              workspaceFolder,
              expectedConfig
            );
          });
        });
      });
      describe('generate debug config if nothing found in launch.json', () => {
        it.each`
          case | settings                                                                                | createDebugConfigOptions
          ${1} | ${{ jestCommandLine: 'yarn test' }}                                                     | ${undefined}
          ${2} | ${{}}                                                                                   | ${{ jestCommandLine: 'jest' }}
          ${3} | ${{ rootPath: 'packages/abc' }}                                                         | ${{ jestCommandLine: 'jest', rootPath: 'packages/abc' }}
          ${3} | ${{ jestCommandLine: 'npx jest', nodeEnv: { key: 'value' }, rootPath: 'packages/abc' }} | ${undefined}
        `('with settings case $case', ({ settings, createDebugConfigOptions }) => {
          sut = newJestExt({ settings });
          const mockConfig: any = { get: jest.fn() };
          vscode.workspace.getConfiguration = jest.fn(() => mockConfig);
          sut.debugTests({ testPath: document.fileName, testName: 'whatever' });
          expect(sut.debugConfigurationProvider.createDebugConfig).toHaveBeenCalledWith(
            workspaceFolder,
            createDebugConfigOptions ?? settings
          );
          expect(vscode.debug.startDebugging).toHaveBeenCalledWith(
            workspaceFolder,
            debugConfiguration2
          );
        });
      });
    });
    describe('should run the supplied test', () => {
      it.each([[document], ['fileName']])('support document parameter: %s', async (doc) => {
        const debugInfo = { testPath: doc.fileName, testName: 'testName' };
        await sut.debugTests(debugInfo);
        expect(vscode.debug.startDebugging).toHaveBeenCalledWith(
          workspaceFolder,
          debugConfiguration2
        );
        const configuration = startDebugging.mock.calls[startDebugging.mock.calls.length - 1][1];
        expect(configuration).toBeDefined();
        expect(configuration.type).toBe(debugConfiguration2.type);
        expect(sut.debugConfigurationProvider.prepareTestRun).toHaveBeenCalledWith(
          debugInfo,
          workspaceFolder,
          undefined
        );
        expect(mockHelpers.escapeRegExp).not.toHaveBeenCalled();
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
        runConfig                                  | languageId      | isTestFile | shouldSchedule | isDirty
        ${'on-demand'}                             | ${'javascript'} | ${true}    | ${false}       | ${false}
        ${'watch'}                                 | ${'javascript'} | ${true}    | ${false}       | ${false}
        ${'on-save'}                               | ${'javascript'} | ${false}   | ${true}        | ${false}
        ${'on-save'}                               | ${'javascript'} | ${true}    | ${true}        | ${false}
        ${'on-save'}                               | ${'json'}       | ${false}   | ${false}       | ${false}
        ${{ type: 'on-save', testFileOnly: true }} | ${'javascript'} | ${false}   | ${false}       | ${true}
        ${{ type: 'on-save', testFileOnly: true }} | ${'javascript'} | ${true}    | ${true}        | ${false}
        ${{ type: 'on-save', testFileOnly: true }} | ${'json'}       | ${true}    | ${false}       | ${false}
      `(
        'with runMode: $runConfig $languageId $isTestFile => $shouldSchedule, $isDirty',
        ({ runConfig, languageId, isTestFile, shouldSchedule, isDirty }) => {
          const sut: any = newJestExt({ settings: { runMode: new RunMode(runConfig) } });
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
                notTestFile: !isTestFile,
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
  describe('toggleCoverage()', () => {
    it('should toggle the coverage overlay visibility', () => {
      const runMode = new RunMode('on-demand');
      const sut = newJestExt({ settings: { runMode } });

      sut.triggerUpdateSettings = jest.fn();
      sut.toggleCoverage();

      expect(runMode.config.coverage).toBe(true);
      expect(sut.triggerUpdateSettings).toHaveBeenCalled();
    });
    it('overrides showCoverageOnLoad settings', async () => {
      const runMode = new RunMode({ type: 'watch', coverage: true });
      const settings = {
        runMode,
        shell: { toSetting: jest.fn() },
      } as any;
      const sut = newJestExt({ settings });

      const { createRunnerWorkspace } = (createProcessSession as jest.Mocked<any>).mock.calls[0][0];
      let runnerWorkspace = createRunnerWorkspace();
      expect(runnerWorkspace.collectCoverage).toBe(true);

      await sut.toggleCoverage();

      const { createRunnerWorkspace: f2 } = (createProcessSession as jest.Mocked<any>).mock
        .calls[1][0];
      runnerWorkspace = f2();
      expect(runMode.config.coverage).toBe(false);
      expect(runnerWorkspace.collectCoverage).toBe(false);
    });
  });

  describe('when active text editor changed', () => {
    beforeEach(() => {
      mockIsInFolder.mockReturnValueOnce(true);
    });
    it('should update the coverage overlay in the given editor', () => {
      const editor: any = { document: { uri: 'whatever', languageId: 'javascript' } };

      const sut = newJestExt();
      sut.onDidChangeActiveTextEditor(editor);

      expect(sut.coverageOverlay.update).toHaveBeenCalled();
    });
    it('should update both decorators and diagnostics for the given editor', () => {
      const sut = newJestExt();
      const editor = mockEditor('file://a/b/c.ts');

      (sut.testResultProvider.getSortedResults as unknown as jest.Mock<{}>).mockReturnValueOnce({
        success: [],
        fail: [],
        skip: [],
        unknown: [],
      });
      (sut.testResultProvider.isTestFile as jest.Mocked<any>).mockReturnValueOnce(true);

      sut.onDidChangeActiveTextEditor(editor);

      expect(updateCurrentDiagnostics).toHaveBeenCalled();
    });
    it('when failed to get test result, it should report error and clear the decorators and diagnostics', () => {
      const sut = newJestExt();
      const editor = mockEditor('a');
      (sut.testResultProvider.getSortedResults as jest.Mocked<any>).mockImplementation(() => {
        throw new Error('force error');
      });
      (sut.testResultProvider.isTestFile as jest.Mocked<any>).mockReturnValueOnce(true);

      sut.onDidChangeActiveTextEditor(editor);
      expect(mockOutputTerminal.write).toHaveBeenCalledWith(
        expect.stringContaining('force error'),
        'error'
      );

      expect(updateCurrentDiagnostics).toHaveBeenCalledWith(
        EmptySortedResult.fail,
        undefined,
        editor
      );
    });
    describe('can skip non test-file related updates', () => {
      let sut;
      beforeEach(() => {
        sut = newJestExt();
        (sut.testResultProvider.getSortedResults as unknown as jest.Mock<{}>).mockReturnValueOnce({
          success: [],
          fail: [],
          skip: [],
          unknown: [],
        });
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
        (sut.testResultProvider.isTestFile as jest.Mocked<any>).mockReturnValueOnce(true);
        sut.triggerUpdateActiveEditor(editor);
        if (shouldSkip) {
          expect(updateCurrentDiagnostics).not.toHaveBeenCalled();
        } else {
          expect(updateCurrentDiagnostics).toHaveBeenCalled();
        }
      });

      it.each`
        isTestFile | shouldUpdate
        ${true}    | ${true}
        ${false}   | ${false}
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
          } else {
            expect(updateCurrentDiagnostics).not.toHaveBeenCalled();
          }
        }
      );
    });
    it('only activate whe editor is under the same workspace', () => {
      const editor: any = { document: { uri: 'whatever' } };
      (vscode.workspace.getWorkspaceFolder as jest.Mocked<any>).mockReturnValue({});
      const sut = newJestExt();
      sut.onDidChangeActiveTextEditor(editor);
      expect(updateCurrentDiagnostics).not.toHaveBeenCalled();
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
      it('will refresh the visible editors for the given workspace, if any', async () => {
        const sut = createJestExt();
        const spy = jest.spyOn(sut, 'triggerUpdateActiveEditor').mockImplementation(() => {});

        // if no activeTextEditor
        vscode.window.activeTextEditor = undefined;
        await sut.startSession();
        expect(spy).not.toHaveBeenCalled();

        // with activeTextEditor
        (vscode.window.visibleTextEditors as any) = [
          {
            document: { uri: 'whatever' },
          },
          {
            document: { uri: 'whatever' },
          },
          {
            document: { uri: 'whatever' },
          },
        ];

        mockIsInFolder.mockReturnValueOnce(true).mockReturnValueOnce(true);
        await sut.startSession();
        expect(spy).toHaveBeenCalledTimes(2);
      });
      it('if failed to start session, show error message and quick fix link', async () => {
        mockProcessSession.start.mockReturnValueOnce(Promise.reject('forced error'));
        const sut = createJestExt();
        await sut.startSession();

        expect(mockOutputTerminal.write).toHaveBeenCalledWith(expect.anything(), 'error');
        expect(executableTerminalLinkProvider.executableLink).toHaveBeenCalled();
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
      
      it('forces update of test file list on session start', async () => {
        const sut = createJestExt();
        
        // Set up spy to check how updateTestFileList is called
        const updateTestFileListSpy = jest.spyOn(sut as any, 'updateTestFileList');
        
        await sut.startSession();
        
        // Verify updateTestFileList was called with force=true
        expect(updateTestFileListSpy).toHaveBeenCalledWith(true);
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

            // stats will be updated in status bar accordingly
            expect(sut.testResultProvider.getTestSuiteStats).toHaveBeenCalled();
            expect(sbUpdateMock).toHaveBeenCalledWith({ stats });
          }
        );
      });
      describe('jestCommandLine validation might trigger session abort', () => {
        it.each`
          validationResult | abort
          ${'pass'}        | ${false}
          ${'fail'}        | ${true}
          ${'restart'}     | ${true}
        `('$validationResult => abort? $abort', async ({ validationResult, abort }) => {
          expect.hasAssertions();

          const sut = newJestExt({ settings: { jestCommandLine: undefined } });
          const validateJestCommandLineSpy = jest.spyOn(sut, 'validateJestCommandLine');
          validateJestCommandLineSpy.mockReturnValue(Promise.resolve(validationResult));
          await sut.startSession();
          // testProvider will always be created
          expect(JestTestProvider).toHaveBeenCalled();
          expect(mockProcessSession.start).toHaveBeenCalledTimes(abort ? 0 : 1);
        });
      });
      it('will update statusBar', async () => {
        expect.hasAssertions();

        const runMode = new RunMode({ type: 'on-demand', coverage: true });
        const sut = newJestExt({ settings: { runMode } });
        await sut.startSession();
        const update = sbUpdateMock.mock.calls.find(
          (call) => call[0].state === 'initial' && call[0].mode
        )[0];
        expect(update.state).toEqual('initial');
        expect(update.mode.config.coverage).toEqual(true);
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
      it('update statusBar status', async () => {
        const sut = createJestExt();
        await sut.stopSession();
        expect(sbUpdateMock).toHaveBeenCalledWith({ state: 'stopped' });
      });
      it('if failed to stop session, display error and quick fix link', async () => {
        mockProcessSession.stop.mockReturnValueOnce(Promise.reject('forced error'));
        const sut = createJestExt();
        await sut.stopSession();
        expect(mockOutputTerminal.write).toHaveBeenCalledWith(expect.anything(), 'error');
        expect(executableTerminalLinkProvider.executableLink).toHaveBeenCalled();
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
    it('should update test file list if marked as dirty before running tests', async () => {
      const sut = newJestExt();
      // Mock that test file list is dirty
      (sut.testResultProvider.isTestFileListDirty as jest.Mock).mockReturnValueOnce(true);
      
      // Set up updateTestFileList to resolve immediately when called
      const updateTestFileListSpy = jest.spyOn(sut as any, 'updateTestFileList').mockResolvedValueOnce(undefined);
      
      await sut.runAllTests();
      
      // Verify updateTestFileList was called before scheduling process
      expect(updateTestFileListSpy).toHaveBeenCalled();
      expect(mockProcessSession.scheduleProcess).toHaveBeenCalled();
    });
    
    describe.each`
      scheduleProcess
      ${{}}
      ${undefined}
    `('scheduleProcess returns $scheduleProcess', ({ scheduleProcess }) => {
      beforeEach(() => {
        mockProcessSession.scheduleProcess.mockReturnValueOnce(scheduleProcess);
      });
      it('can run all test for the workspace', async () => {
        const sut = newJestExt();
        const dirtyFiles: any = sut['dirtyFiles'];
        dirtyFiles.clear = jest.fn();

        await sut.runAllTests();
        expect(mockProcessSession.scheduleProcess).toHaveBeenCalledWith({
          type: 'all-tests',
          nonBlocking: true,
        });
        if (scheduleProcess) {
          expect(dirtyFiles.clear).toHaveBeenCalled();
        } else {
          expect(dirtyFiles.clear).not.toHaveBeenCalled();
        }
      });
      it('can run all test for the given editor', async () => {
        const sut = newJestExt();

        const dirtyFiles: any = sut['dirtyFiles'];
        dirtyFiles.delete = jest.fn();

        const editor: any = { document: { fileName: 'whatever' } };

        await sut.runAllTests(editor);
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
      isTestFile | notTestFile
      ${true}    | ${false}
      ${false}   | ${true}
    `(
      'pass testFile status: isTestFile=$isTestFile => notTestFile=$notTestFile',
      async ({ isTestFile, notTestFile }) => {
        const sut = newJestExt();
        const editor: any = { document: { fileName: 'whatever' } };

        (sut.testResultProvider.isTestFile as jest.Mocked<any>).mockReturnValueOnce(isTestFile);

        await sut.runAllTests(editor);
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
  describe('mark test file list as dirty upon file system change', () => {
    let jestExt: any;
    beforeEach(() => {
      jestExt = newJestExt();
    });
    it('when new file is created', () => {
      jestExt.onDidCreateFiles({});
      expect(jestExt.testResultProvider.markTestFileListDirty).toHaveBeenCalled();
      expect(mockProcessSession.scheduleProcess).not.toHaveBeenCalled();
    });
    it('when file is renamed', () => {
      jestExt.onDidRenameFiles({});
      expect(jestExt.testResultProvider.markTestFileListDirty).toHaveBeenCalled();
      expect(mockProcessSession.scheduleProcess).not.toHaveBeenCalled();
    });
    it('when file is deleted', () => {
      jestExt.onDidDeleteFiles({});
      expect(jestExt.testResultProvider.markTestFileListDirty).toHaveBeenCalled();
      expect(mockProcessSession.scheduleProcess).not.toHaveBeenCalled();
    });
  });
  describe('triggerUpdateSettings', () => {
    it('should create a new ProcessSession', async () => {
      const jestExt = newJestExt();
      expect(createProcessSession).toHaveBeenCalledTimes(1);
      const settings: any = {
        debugMode: true,
        runMode: new RunMode('watch'),
        jestCommandLine: 'jest',
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
      ({ updateWithData } = (createProcessSession as jest.Mocked<any>).mock.calls[0][0]);

      (resultsWithLowerCaseWindowsDriveLetters as jest.Mocked<any>).mockReturnValue({
        coverageMap: {},
      });
      vscode.window.visibleTextEditors = [];
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
    it('will update visible editors for the current workspace and test file list', () => {
      (vscode.window.visibleTextEditors as any) = [
        mockEditor('a'),
        mockEditor('b'),
        mockEditor('c'),
      ];
      (sut.testResultProvider.isTestFile as jest.Mocked<any>).mockImplementation((fileName) => {
        if (fileName === 'a') return 'yes';
        if (fileName === 'b') return 'no';
        if (fileName === 'c') return 'maybe';
        throw new Error(`unexpected document editor.document.fileName`);
      });
      mockIsInFolder.mockImplementation((uri) => {
        return uri.fsPath !== 'b';
      });
      const triggerUpdateActiveEditorSpy = jest.spyOn(sut as any, 'triggerUpdateActiveEditor');
      expect(triggerUpdateActiveEditorSpy).toHaveBeenCalledTimes(0);
      updateWithData();
      expect(triggerUpdateActiveEditorSpy).toHaveBeenCalledTimes(2);
    });
    it('will fire onTestDataAvailable event', () => {
      const process: any = { id: 'a process id' };
      updateWithData({}, process);
      expect(sut.events.onTestDataAvailable.fire).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.anything(), process })
      );
    });
  });

  describe('deactivate', () => {
    it('will stop session and output channel', () => {
      const sut = newJestExt();
      sut.deactivate();
      expect(mockProcessSession.stop).toHaveBeenCalledTimes(1);
      expect(mockOutputTerminal.dispose).toHaveBeenCalledTimes(1);
    });
    it('will dispose test provider if initialized', async () => {
      const sut = newJestExt();
      sut.deactivate();
      expect(mockTestProvider.dispose).not.toHaveBeenCalledTimes(1);
      await sut.startSession();
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
    it('will remove workspace from statusBar', () => {
      const sut = newJestExt();
      sut.deactivate();
      expect(statusBar.removeWorkspaceFolder).toHaveBeenCalled();
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

        onRunEvent({ type: 'end', process, error: 'whatever' });
        expect(sbUpdateMock).toHaveBeenCalledWith({ state: 'exec-error' });
      });
      it('data event: notify status bar if error', () => {
        onRunEvent({ type: 'data', process, isError: false });
        expect(sbUpdateMock).not.toHaveBeenCalled();

        onRunEvent({ type: 'data', process, isError: true });
        expect(sbUpdateMock).toHaveBeenCalledWith({ state: 'exec-error' });
      });
      describe('exit event: notify status bar', () => {
        it('if no error: status bar done', () => {
          onRunEvent({ type: 'exit', process });
          expect(sbUpdateMock).toHaveBeenCalledWith({ state: 'done' });
        });
        describe('if error', () => {
          it('if error: status bar stopped and display quick-fix link in output', () => {
            onRunEvent({ type: 'exit', error: 'something is wrong', process });
            expect(sbUpdateMock).toHaveBeenCalledWith({ state: 'exec-error' });
            expect(executableTerminalLinkProvider.executableLink).toHaveBeenCalled();
            expect(mockOutputTerminal.write).toHaveBeenCalledWith(expect.anything(), 'info');
            expect(process.userData?.execError).toEqual(true);
          });
          it('will not report error if already reported', () => {
            mockOutputTerminal.write.mockClear();
            process.userData = { execError: true };
            onRunEvent({ type: 'exit', error: 'something is wrong', process });
            expect(sbUpdateMock).toHaveBeenCalledWith({ state: 'exec-error' });
            expect(executableTerminalLinkProvider.executableLink).not.toHaveBeenCalled();
            expect(mockOutputTerminal.write).not.toHaveBeenCalled();
          });
        });
      });
      it.each`
        numTotalTestSuites
        ${undefined}
        ${17}
      `(
        'long-run event with $numTotalTestSuites numTotalTestSuites output warnings',
        ({ numTotalTestSuites }) => {
          mockOutputTerminal.write.mockClear();
          process = { ...process, request: { type: 'all-tests' } };
          onRunEvent({ type: 'long-run', numTotalTestSuites, threshold: 60000, process });
          expect(executableTerminalLinkProvider.executableLink).toHaveBeenCalled();
          const msg = mockOutputTerminal.write.mock.calls[0][0];
          if (numTotalTestSuites) {
            expect(msg).toContain(`${numTotalTestSuites} suites`);
          } else {
            expect(msg).not.toContain(`${numTotalTestSuites} suites`);
          }
        }
      );
    });
    it('events are disposed when extension deactivated', () => {
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
  describe('can change runMode', () => {
    let sut, runMode, quickSwitchSpy, triggerUpdateSettingsSpy;
    beforeEach(() => {
      runMode = new RunMode('watch');

      quickSwitchSpy = jest.spyOn(runMode, 'quickSwitch');

      sut = newJestExt({ settings: { runMode } });
      triggerUpdateSettingsSpy = jest.spyOn(sut, 'triggerUpdateSettings');
    });
    it('no op if runMode did not change', async () => {
      quickSwitchSpy.mockImplementation(() => {
        return undefined;
      });

      await sut.changeRunMode();
      expect(quickSwitchSpy).toHaveBeenCalled();
      expect(triggerUpdateSettingsSpy).not.toHaveBeenCalled();
    });
    it('restart session if runMode changed', async () => {
      const runMode2 = new RunMode('on-demand');
      quickSwitchSpy.mockImplementation(() => {
        return runMode2;
      });

      await sut.changeRunMode();
      expect(quickSwitchSpy).toHaveBeenCalled();
      expect(triggerUpdateSettingsSpy).toHaveBeenCalledWith(
        expect.objectContaining({ runMode: runMode2 })
      );
    });
  });
  describe('enableLoginShell', () => {
    let mockShell;
    beforeEach(() => {
      mockShell = {
        toSetting: jest.fn(),
        useLoginShell: false,
        enableLoginShell: jest.fn(),
      };
    });
    describe('only restart session when needed', () => {
      it.each`
        useLoginShell | restartSession
        ${false}      | ${true}
        ${true}       | ${false}
        ${'never'}    | ${false}
      `(
        'useLoginShell=$useLoginShell, restart session = $restartSession',
        ({ useLoginShell, restartSession }) => {
          mockShell.useLoginShell = useLoginShell;
          const sut: any = newJestExt({ settings: { shell: mockShell } });
          const startSessionSpy = jest.spyOn(sut, 'startSession');

          sut.enableLoginShell();
          if (restartSession) {
            expect(mockShell.enableLoginShell).toHaveBeenCalled();
            expect(startSessionSpy).toHaveBeenCalled();
          } else {
            expect(mockShell.enableLoginShell).not.toHaveBeenCalled();
            expect(startSessionSpy).not.toHaveBeenCalled();
          }
        }
      );
    });
  });
  it('runItemCommand will delegate operation to testProvider', async () => {
    const jestExt = newJestExt();
    await jestExt.startSession();
    const testItem: any = {};
    await jestExt.runItemCommand(testItem, ItemCommand.updateSnapshot);
    expect(mockTestProvider.runItemCommand).toHaveBeenCalledWith(
      testItem,
      ItemCommand.updateSnapshot
    );
  });
  describe('validateJestCommandLine', () => {
    const ws1 = makeUri('test-folder', 'w1', 'child');
    const ws2 = makeUri('test-folder', 'w2');
    const vs1 = { rootPath: 'w1', jestCommandLine: 'jest1' };
    const vs2 = { rootPath: 'w2', jestCommandLine: 'jest2' };
    describe('when user has set a jestCommandLine', () => {
      it.each`
        jestCommandLine | returnValue
        ${'jest'}       | ${'pass'}
        ${''}           | ${'fail'}
      `(
        'returns $returnValue for jestCommandLine $jestCommandLine',
        async ({ jestCommandLine, returnValue }) => {
          (helper.getValidJestCommand as jest.Mocked<any>).mockReturnValue({ validSettings: [] });
          const jestExt = newJestExt({ settings: { jestCommandLine } });
          await expect(jestExt.validateJestCommandLine()).resolves.toEqual(returnValue);
        }
      );
    });
    describe('search file system for a valid command', () => {
      it.each`
        case | validSettings | uris          | validationResult | updateSettings
        ${1} | ${[vs1]}      | ${undefined}  | ${'restart'}     | ${vs1}
        ${2} | ${[]}         | ${[ws1, ws2]} | ${'fail'}        | ${undefined}
        ${3} | ${[]}         | ${undefined}  | ${'fail'}        | ${undefined}
        ${4} | ${[vs1, vs2]} | ${[ws1, ws2]} | ${'fail'}        | ${undefined}
      `('$case', async ({ validSettings, uris, validationResult, updateSettings }) => {
        (helper.getValidJestCommand as jest.Mocked<any>).mockReturnValue({
          uris,
          validSettings,
        });

        const jestExt = newJestExt({ settings: { jestCommandLine: undefined } });
        const updateSettingSpy = jest.spyOn(jestExt, 'triggerUpdateSettings');
        updateSettingSpy.mockReturnValueOnce(Promise.resolve());

        await expect(jestExt.validateJestCommandLine()).resolves.toEqual(validationResult);
        expect(helper.getValidJestCommand).toHaveBeenCalledTimes(1);

        if (updateSettings) {
          expect(updateSettingSpy).toHaveBeenCalledWith(expect.objectContaining(updateSettings));
        } else {
          expect(updateSettingSpy).not.toHaveBeenCalled();
        }
        if (validationResult !== 'pass') {
          if (updateSettings) {
            expect(mockOutputTerminal.write).not.toHaveBeenCalledWith(expect.anything(), 'error');
          } else {
            expect(mockOutputTerminal.write).toHaveBeenCalledWith(expect.anything(), 'error');
            expect(sbUpdateMock).toHaveBeenCalledWith({ state: 'exec-error' });
          }
        }
      });
    });
    describe('when detection failed in a monorepo', () => {
      it.each`
        case                     | folders       | actionType
        ${'no workspaceFolders'} | ${undefined}  | ${'setup-cmdline'}
        ${'single-root'}         | ${[ws1]}      | ${'setup-monorepo'}
        ${'multi-root'}          | ${[ws1, ws2]} | ${'setup-cmdline'}
      `('$case', async ({ folders, actionType }) => {
        (vscode.workspace as any).workspaceFolders = folders
          ? folders.map(() => makeWorkspaceFolder('whatever'))
          : undefined;
        (helper.getValidJestCommand as jest.Mocked<any>).mockReturnValue({
          validSettings: [vs1, vs2],
        });

        const jestExt = newJestExt({ settings: { jestCommandLine: undefined } });
        const updateSettingSpy = jest.spyOn(jestExt, 'triggerUpdateSettings');
        updateSettingSpy.mockReturnValueOnce(Promise.resolve());

        await expect(jestExt.validateJestCommandLine()).resolves.toEqual('fail');

        const [wsName, command, actionTypes] = (
          executableTerminalLinkProvider.executableLink as jest.Mocked<any>
        ).mock.calls[0];
        expect(wsName).toEqual(jestExt.workspaceFolder.name);
        expect(command).toContain('show-quick-fix');
        expect(actionTypes).toContain(actionType);
      });
    });
  });
  describe('output handling', () => {
    let runMode;
    let sut: JestExt;
    beforeEach(() => {
      runMode = new RunMode('on-demand');
      sut = newJestExt({ settings: { runMode } });
    });
    it('delegate output handling to outputManager during runEvent', () => {
      const onRunEvent = (sut.events.onRunEvent.event as jest.Mocked<any>).mock.calls[0][0];
      const process = { id: 'a process id', request: { type: 'watch' } };
      onRunEvent({ type: 'start', process });
      expect(mockOutputManager.showOutputOn).toHaveBeenCalledWith(
        'run',
        expect.anything(),
        runMode
      );
    });
    describe('when test errors occurred', () => {
      it('will notify outputManager', () => {
        const onRunEvent = (sut.events.onRunEvent.event as jest.Mocked<any>).mock.calls[0][0];
        const process = { id: 'a process id', request: { type: 'watch' } };
        onRunEvent({ type: 'test-error', process });
        expect(mockOutputManager.showOutputOn).toHaveBeenCalledWith(
          'run',
          expect.anything(),
          runMode
        );
        expect(mockOutputManager.showOutputOn).toHaveBeenCalledWith(
          'test-error',
          expect.anything(),
          runMode
        );
      });
      it('will only notify outputManager once per run cycle', () => {
        const onRunEvent = (sut.events.onRunEvent.event as jest.Mocked<any>).mock.calls[0][0];
        const process = { id: 'a process id', request: { type: 'watch' } };

        onRunEvent({ type: 'test-error', process, userData: {} });
        expect(mockOutputManager.showOutputOn).toHaveBeenCalledWith(
          'test-error',
          expect.anything(),
          runMode
        );
        mockOutputManager.showOutputOn.mockClear();

        onRunEvent({ type: 'test-error', process });
        expect(mockOutputManager.showOutputOn).not.toHaveBeenCalledWith(
          'test-error',
          expect.anything(),
          runMode
        );
      });
      it('will reset testError state when test run ended', () => {
        const sut = newJestExt();
        const onRunEvent = (sut.events.onRunEvent.event as jest.Mocked<any>).mock.calls[0][0];
        const process: any = { id: 'a process id', request: { type: 'watch' } };

        onRunEvent({ type: 'test-error', process });
        expect(process.userData?.testError).toEqual(true);

        onRunEvent({ type: 'end', process });
        expect(process.userData?.testError).toBeUndefined();
      });
    });
    it('when setting changed, output setting will change accordingly', () => {
      const runMode = new RunMode({ type: 'watch', deferred: false });
      const sut = newJestExt({ settings: { runMode } });
      expect(mockOutputTerminal.revealOnError).toEqual(true);
      const runMode2 = new RunMode({ type: 'watch', deferred: true });
      sut.triggerUpdateSettings({ runMode: runMode2 } as any);
      expect(mockOutputTerminal.revealOnError).toEqual(false);
      expect(mockOutputTerminal.close).toHaveBeenCalled();
    });
  });
  describe('parserPluginOptions', () => {
    it('pass to TestResultProvider on creation', () => {
      newJestExt();
      expect(TestResultProvider).toHaveBeenCalledWith(expect.anything(), {
        verbose: false,
        parserOptions: undefined,
      });
      const parserPluginOptions = { decorators: { decoratorsBeforeExport: false } };
      const settings: any = {
        parserPluginOptions,
      };
      newJestExt({ settings });
      expect(TestResultProvider).toHaveBeenCalledWith(expect.anything(), {
        verbose: false,
        parserOptions: { plugins: parserPluginOptions },
      });
    });
    it('update TestResultProvider upon setting changes', async () => {
      expect.hasAssertions();
      const jestExt = newJestExt();

      const parserPluginOptions = { decorators: 'legacy' };
      const settings: any = {
        debugMode: true,
        parserPluginOptions,
        runMode: new RunMode('watch'),
      };
      await jestExt.triggerUpdateSettings(settings);
      expect(jestExt.testResultProvider.options).toEqual({
        parserOptions: { plugins: parserPluginOptions },
        verbose: true,
      });
    });
  });
  describe('virtual folder related', () => {
    it('added name and workspaceFolder properties', () => {
      const jestExt = newJestExt();
      expect(jestExt.name).toEqual(workspaceFolder.name);
      expect(jestExt.workspaceFolder).toEqual(workspaceFolder);
    });
    it('instantiate a disabled JestExt will throw exception', () => {
      expect(() => newJestExt({ settings: { enable: false } })).toThrow('Jest is disabled');
    });
  });
  it('setupExtensionForFolder pass extension info via executeCommand', () => {
    const jestExt = newJestExt();
    jestExt.setupExtensionForFolder({ taskId: 'cmdLine' });

    expect(vscode.commands.executeCommand).toHaveBeenCalledWith(
      expect.stringContaining(`setup-extension`),
      expect.objectContaining({
        workspace: jestExt.workspaceFolder,
        taskId: 'cmdLine',
      })
    );
  });
  describe('defer runMode', () => {
    let doc: any;
    let editor: any;
    beforeEach(() => {
      doc = { uri: 'whatever', languageId: 'javascript' };
      editor = { document: doc };
      vscode.window.visibleTextEditors = [editor];
      mockIsInFolder.mockReturnValueOnce(true);
    });
    it('will still create testProvider and parse test blocks while skipping the rest', async () => {
      expect.hasAssertions();

      const runMode = new RunMode({ type: 'watch', deferred: true });
      const jestExt = newJestExt({ settings: { runMode } });

      const validateJestCommandLineSpy = jest.spyOn(jestExt, 'validateJestCommandLine');
      (jestExt.testResultProvider.isTestFile as jest.Mocked<any>).mockReturnValueOnce(true);
      (jestExt.testResultProvider.getSortedResults as jest.Mocked<any>).mockReturnValueOnce([]);

      await jestExt.startSession();

      expect(JestTestProvider).toHaveBeenCalledTimes(1);
      expect(jestExt.testResultProvider.getSortedResults).toHaveBeenCalled();
      expect(jestExt.coverageOverlay.update).toHaveBeenCalled();
      expect(updateCurrentDiagnostics).toHaveBeenCalled();

      expect(validateJestCommandLineSpy).not.toHaveBeenCalled();
      expect(mockProcessSession.scheduleProcess).not.toHaveBeenCalled();
    });
    it('will not do any auto-run for on-save mode either', async () => {
      expect.hasAssertions();
      let runMode = new RunMode({ type: 'on-save', deferred: true });
      let jestExt = newJestExt({ settings: { runMode } });

      await jestExt.startSession();
      jestExt.onDidSaveTextDocument(doc);

      expect(mockProcessSession.scheduleProcess).not.toHaveBeenCalled();

      // while in non-deferred mode, the run will be scheduled
      runMode = new RunMode({ type: 'on-save', deferred: false });
      jestExt = newJestExt({ settings: { runMode } });

      await jestExt.startSession();
      jestExt.onDidSaveTextDocument(doc);
      expect(mockProcessSession.scheduleProcess).toHaveBeenCalledWith(
        expect.objectContaining({ type: 'by-file' })
      );
    });
    describe('will auto exit defer mode by any on-demand run', () => {
      it('when runAllTest is called', async () => {
        expect.hasAssertions();

        const runMode = new RunMode({ type: 'watch', deferred: true });
        const jestExt = newJestExt({ settings: { runMode } });
        await jestExt.startSession();

        expect(runMode.config.deferred).toBe(true);
        expect(mockOutputManager.showOutputOn).not.toHaveBeenCalled();
        expect(mockOutputTerminal.revealOnError).toEqual(false);
        expect(mockProcessSession.scheduleProcess).not.toHaveBeenCalled();

        await jestExt.runAllTests();

        expect(runMode.config.deferred).toBe(false);
        expect(mockOutputManager.showOutputOn).toHaveBeenCalledWith(
          'run',
          expect.anything(),
          runMode
        );
        expect(mockOutputTerminal.revealOnError).toEqual(true);
        expect(mockProcessSession.scheduleProcess).toHaveBeenCalledWith(
          expect.objectContaining({ type: 'all-tests' })
        );
      });
      it('when executing any itemCommand', async () => {
        expect.hasAssertions();

        const runMode = new RunMode({ type: 'on-demand', deferred: true });
        const jestExt = newJestExt({ settings: { runMode } });
        await jestExt.startSession();

        expect(runMode.config.deferred).toBe(true);
        expect(mockOutputManager.showOutputOn).not.toHaveBeenCalled();
        expect(mockTestProvider.runItemCommand).not.toHaveBeenCalled();

        const testItem: any = {};
        const itemCommand: any = {};
        await jestExt.runItemCommand(testItem, itemCommand);

        expect(runMode.config.deferred).toBe(false);
        expect(mockOutputManager.showOutputOn).toHaveBeenCalledWith(
          'run',
          expect.anything(),
          runMode
        );
        expect(mockTestProvider.runItemCommand).toHaveBeenCalled();
      });
      describe('when triggered explicitly (by UI)', () => {
        it.each`
          trigger                       | runTestError
          ${undefined}                  | ${false}
          ${{ request: {}, token: {} }} | ${true}
          ${{ request: {}, token: {} }} | ${false}
        `(
          'with trigger=$trigger, when runTest throws error=${runTestError}',
          async ({ trigger, runTestError }) => {
            expect.hasAssertions();

            const runMode = new RunMode({ type: 'watch', deferred: true });
            const jestExt = newJestExt({ settings: { runMode } });

            jestExt.triggerUpdateSettings = jest.fn();

            await jestExt.startSession();
            expect(runMode.config.deferred).toBe(true);

            if (runTestError) {
              mockTestProvider.runTests.mockImplementation(() => {
                throw new Error('force a test error');
              });
            }
            await jestExt.exitDeferMode(trigger);

            expect(runMode.config.deferred).toBe(false);
            expect(jestExt.triggerUpdateSettings).toHaveBeenCalled();
            if (trigger) {
              expect(mockTestProvider.runTests).toHaveBeenCalled();
            } else {
              expect(mockTestProvider.runTests).not.toHaveBeenCalled();
            }

            // if not in deferred mode, no-ops
            mockTestProvider.runTests.mockClear();
            jestExt.triggerUpdateSettings = jest.fn();
            await jestExt.exitDeferMode();
            expect(runMode.config.deferred).toBe(false);
            expect(jestExt.triggerUpdateSettings).not.toHaveBeenCalled();
            expect(mockTestProvider.runTests).not.toHaveBeenCalled();
          }
        );
      });
    });
  });
  it.each`
    withError
    ${false}
    ${true}
  `('withError=$withError: can save current runMode to settings', async ({ withError }) => {
    expect.hasAssertions();

    const runMode = new RunMode('watch');
    const jestExt = newJestExt({ settings: { runMode } });

    if (withError) {
      (updateSetting as jest.Mocked<any>).mockImplementation(() => {
        throw new Error('forced error');
      });
    }
    await jestExt.saveRunMode();
    expect(updateSetting).toHaveBeenCalledWith(jestExt.workspaceFolder, 'runMode', runMode.config);

    if (withError) {
      expect(mockOutputTerminal.write).toHaveBeenCalledWith(expect.anything(), 'error');
    }
  });
});
