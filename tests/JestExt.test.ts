jest.unmock('events');
jest.unmock('../src/JestExt');
jest.mock('../src/helpers', () => ({
  cleanAnsi: (str: string) => str,
  pathToJest: jest.fn(),
  pathToConfig: jest.fn(),
}));

jest.mock('../src/DebugCodeLens', () => ({
  DebugCodeLensProvider: class MockCodeLensProvider {},
}));
jest.mock('os');
jest.mock('../src/decorations');

const update = jest.fn();
const statusBar = {
  bind: () => ({ update }),
};
jest.mock('../src/StatusBar', () => ({ statusBar }));

import { JestExt } from '../src/JestExt';
import { ProjectWorkspace } from 'jest-editor-support';
import { window, workspace, debug } from 'vscode';
import { hasDocument, isOpenInMultipleEditors } from '../src/editor';
import * as decorations from '../src/decorations';
import { updateCurrentDiagnostics } from '../src/diagnostics';
import { JestProcessManager, JestProcess } from '../src/JestProcessManagement';
import * as messaging from '../src/messaging';
import { CoverageMapProvider } from '../src/Coverage';

/* eslint jest/expect-expect: ["error", { "assertFunctionNames": ["expect", "expectItTakesNoAction"] }] */

describe('JestExt', () => {
  const getConfiguration = workspace.getConfiguration as jest.Mock<any>;
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
        null,
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
      ((decorations.failingAssertionStyle as unknown) as jest.Mock<{}>).mockReturnValue({});
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
      const sut = new JestExt(
        null,
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
      const expected = {};
      ((decorations.failingAssertionStyle as unknown) as jest.Mock<{}>).mockReturnValueOnce(
        expected
      );
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
    const workspaceFolder = {} as any;
    const fileName = 'fileName';
    const testNamePattern = 'testNamePattern';

    it('should run the supplied test', async () => {
      const startDebugging = (debug.startDebugging as unknown) as jest.Mock<{}>;
      ((startDebugging as unknown) as jest.Mock<{}>).mockImplementation(
        async (_folder: any, nameOrConfig: any) => {
          // trigger fallback to default configuration
          if (typeof nameOrConfig === 'string') {
            throw null;
          }
        }
      );

      const debugConfiguration = { type: 'dummyconfig' };
      const sut = new JestExt(
        null,
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
      ((sut.debugConfigurationProvider
        .provideDebugConfigurations as unknown) as jest.Mock<{}>).mockReturnValue([
        debugConfiguration,
      ]);

      await sut.runTest(workspaceFolder, fileName, testNamePattern);

      expect(debug.startDebugging).toHaveBeenCalledWith(workspaceFolder, debugConfiguration);

      const configuration = startDebugging.mock.calls[startDebugging.mock.calls.length - 1][1];
      expect(configuration).toBeDefined();
      expect(configuration.type).toBe('dummyconfig');

      expect(sut.debugConfigurationProvider.prepareTestRun).toBeCalledWith(
        fileName,
        testNamePattern
      );
    });
  });

  describe('onDidCloseTextDocument()', () => {
    const projectWorkspace = new ProjectWorkspace(null, null, null, null);
    const sut = new JestExt(
      null,
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
      null,
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
      null,
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
      null,
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
        null,
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
        null,
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
        null,
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
        null,
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
        null,
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
        null,
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
      ((decorations.failingItName as unknown) as jest.Mock<{}>).mockReturnValue({ key: 'fail' });
      ((decorations.passingItName as unknown) as jest.Mock<{}>).mockReturnValue({ key: 'pass' });
      ((decorations.skipItName as unknown) as jest.Mock<{}>).mockReturnValue({ key: 'skip' });
      ((decorations.notRanItName as unknown) as jest.Mock<{}>).mockReturnValue({ key: 'notRan' });

      const projectWorkspace = new ProjectWorkspace(null, null, null, null);
      sut = new JestExt(
        null,
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
          case 'notRan':
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
      ((decorations.failingAssertionStyle as unknown) as jest.Mock<{}>).mockReturnValueOnce(
        expected
      );
      sut.updateDecorators(testResults2, mockEditor);
      expect(decorations.failingAssertionStyle).not.toBeCalled();
      expect(mockEditor.setDecorations).toHaveBeenCalledTimes(4);

      jest.clearAllMocks();
      settings.enableInlineErrorMessages = true;
      sut.updateDecorators(testResults2, mockEditor);
      expect(decorations.failingAssertionStyle).toHaveBeenCalledTimes(2);
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
        null,
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
        null,
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
        null,
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
        null,
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
