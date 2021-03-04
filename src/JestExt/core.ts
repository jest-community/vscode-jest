import * as vscode from 'vscode';
import { JestTotalResults } from 'jest-editor-support';

import { TestStatus } from '../decorations/test-status';
import inlineErrorStyle from '../decorations/inline-error';
import { statusBar, StatusBar, Mode, StatusBarUpdate, SBTestStats } from '../StatusBar';
import {
  TestReconciliationState,
  TestResultProvider,
  TestResult,
  resultsWithLowerCaseWindowsDriveLetters,
  SortedTestResults,
  TestResultStatusInfo,
  TestReconciliationStateType,
} from '../TestResults';
import { testIdString, IdStringType, escapeRegExp, emptyTestStats } from '../helpers';
import { CoverageMapProvider, CoverageCodeLensProvider } from '../Coverage';
import { updateDiagnostics, updateCurrentDiagnostics, resetDiagnostics } from '../diagnostics';
import { DebugCodeLensProvider, DebugTestIdentifier } from '../DebugCodeLens';
import { DebugConfigurationProvider } from '../DebugConfigurationProvider';
import { DecorationOptions, TestStats } from '../types';
import { isOpenInMultipleEditors } from '../editor';
import { CoverageOverlay } from '../Coverage/CoverageOverlay';
import { resultsWithoutAnsiEscapeSequence } from '../TestResults/TestResult';
import { CoverageMapData } from 'istanbul-lib-coverage';
import { Logging } from '../logging';
import { createProcessSession, ProcessSession } from './process-session';
import { JestExtContext, JestExtSessionAware } from './types';
import * as messaging from '../messaging';
import { SupportedLanguageIds } from '../appGlobals';
import { createJestExtContext, getExtensionResourceSettings } from './helper';
import { PluginResourceSettings } from '../Settings';

interface RunTestPickItem extends vscode.QuickPickItem {
  id: DebugTestIdentifier;
}

/** extract lines starts and end with [] */
export class JestExt {
  coverageMapProvider: CoverageMapProvider;
  coverageOverlay: CoverageOverlay;

  testResultProvider: TestResultProvider;
  debugCodeLensProvider: DebugCodeLensProvider;
  debugConfigurationProvider: DebugConfigurationProvider;
  coverageCodeLensProvider: CoverageCodeLensProvider;

  // So you can read what's going on
  channel: vscode.OutputChannel;

  failingAssertionDecorators: { [fileName: string]: vscode.TextEditorDecorationType[] };

  private decorations: TestStatus;

  // The ability to show fails in the problems section
  private failDiagnostics: vscode.DiagnosticCollection;

  // We have to keep track of our inline assert fails to remove later

  private processSession: ProcessSession;
  private vscodeContext: vscode.ExtensionContext;

  private status: ReturnType<StatusBar['bind']>;
  private logging: Logging;
  private sessionAwareComponents: JestExtSessionAware[];
  private testFiles?: string[];
  private extContext: JestExtContext;
  private dirtyFiles: Set<string> = new Set();

  constructor(
    vscodeContext: vscode.ExtensionContext,
    workspaceFolder: vscode.WorkspaceFolder,
    debugCodeLensProvider: DebugCodeLensProvider,
    debugConfigurationProvider: DebugConfigurationProvider,
    coverageCodeLensProvider: CoverageCodeLensProvider
  ) {
    const pluginSettings = getExtensionResourceSettings(workspaceFolder.uri);

    this.extContext = createJestExtContext(workspaceFolder, pluginSettings);
    this.logging = this.extContext.loggingFactory.create('JestExt');

    this.channel = vscode.window.createOutputChannel(`Jest (${workspaceFolder.name})`);
    this.failingAssertionDecorators = {};
    this.failDiagnostics = vscode.languages.createDiagnosticCollection(
      `Jest (${workspaceFolder.name})`
    );
    this.debugCodeLensProvider = debugCodeLensProvider;
    this.coverageCodeLensProvider = coverageCodeLensProvider;

    this.coverageMapProvider = new CoverageMapProvider();
    this.vscodeContext = vscodeContext;
    this.coverageOverlay = new CoverageOverlay(
      vscodeContext,
      this.coverageMapProvider,
      pluginSettings.showCoverageOnLoad,
      pluginSettings.coverageFormatter,
      pluginSettings.coverageColors
    );

    this.testResultProvider = new TestResultProvider(pluginSettings.debugMode ?? false);
    this.debugConfigurationProvider = debugConfigurationProvider;

    this.status = statusBar.bind(workspaceFolder.name);

    // The theme stuff
    this.decorations = new TestStatus(vscodeContext);
    // reset the jest diagnostics
    resetDiagnostics(this.failDiagnostics);

    this.processSession = this.createProcessSession();
    this.sessionAwareComponents = [this.testResultProvider];

    this.setupStatusBar();
  }

  private createProcessSession(): ProcessSession {
    return createProcessSession({
      ...this.extContext,
      output: this.channel,
      updateStatusBar: this.updateStatusBar.bind(this),
      updateWithData: this.updateWithData.bind(this),
    });
  }
  private toSBStats(stats: TestStats): SBTestStats {
    return { ...stats, isDirty: this.dirtyFiles.size > 0 };
  }
  private setTestFiles(list: string[] | undefined): void {
    this.testFiles = list;
    this.testResultProvider.updateTestFileList(list);
    this.updateStatusBar({ stats: this.toSBStats(this.testResultProvider.getTestSuiteStats()) });
  }
  /**
   * starts a new session, notify all session-aware components and gather the metadata.
   */
  public async startSession(newSession = false): Promise<void> {
    try {
      this.dirtyFiles.clear();
      this.resetStatusBar();

      // new session is needed when the JestExtContext changes
      if (newSession) {
        await this.processSession.stop();
        this.processSession = this.createProcessSession();
        this.channel.appendLine('Starting a new Jest Process Session');
      } else {
        this.channel.appendLine('Starting Jest Session');
      }
      await this.processSession.start();

      this.sessionAwareComponents.forEach((c) => c.onSessionStart?.());

      this.updateTestFileList();
      this.channel.appendLine('Jest Session Started');
    } catch (e) {
      this.logging('error', 'failed to start jest session:', e);
      this.channel.appendLine('Failed to start jest session');
      messaging.systemErrorMessage(
        'Failed to start jest session...',
        messaging.showTroubleshootingAction
      );
    }
  }

  public async stopSession(): Promise<void> {
    try {
      this.channel.appendLine('Stopping Jest Session');
      await this.processSession.stop();

      this.sessionAwareComponents.forEach((c) => c.onSessionStop?.());

      this.channel.appendLine('Jest Session Stopped');
      this.updateStatusBar({ state: 'stopped' });
    } catch (e) {
      this.logging('error', 'failed to stop jest session:', e);
      this.channel.appendLine('Failed to stop jest session');
      messaging.systemErrorMessage(
        'Failed to stop jest session...',
        messaging.showTroubleshootingAction
      );
    }
  }

  /** update custom editor context used by vscode when clause, such as `jest:run.interactive` in package.json */
  private updateEditorContext(): void {
    const isInteactive = this.extContext.autoRun.isOff || !this.extContext.autoRun.isWatch;
    vscode.commands.executeCommand('setContext', 'jest:run.interactive', isInteactive);
  }
  private updateTestFileEditor(editor: vscode.TextEditor): void {
    if (!this.isTestFileEditor(editor)) {
      return;
    }

    const filePath = editor.document.fileName;
    let testResults: SortedTestResults | undefined;
    try {
      testResults = this.testResultProvider.getSortedResults(filePath);
    } catch (e) {
      this.channel.appendLine(`${filePath}: failed to parse test results: ${e.toString()}`);
      // assign an empty result so we can clear the outdated decorators/diagnostics etc
      testResults = {
        fail: [],
        skip: [],
        success: [],
        unknown: [],
      };
    }

    if (!testResults) {
      return;
    }

    this.updateDecorators(testResults, editor);
    updateCurrentDiagnostics(testResults.fail, this.failDiagnostics, editor);
  }

  public triggerUpdateActiveEditor(editor: vscode.TextEditor): void {
    this.updateEditorContext();

    this.coverageOverlay.updateVisibleEditors();

    this.updateTestFileEditor(editor);
  }

  public triggerUpdateSettings(newSettings?: PluginResourceSettings): Promise<void> {
    const updatedSettings =
      newSettings ?? getExtensionResourceSettings(this.extContext.workspace.uri);
    this.extContext = createJestExtContext(this.extContext.workspace, updatedSettings);

    // debug
    this.testResultProvider.verbose = updatedSettings.debugMode ?? false;

    // coverage
    const showCoverage = this.coverageOverlay.enabled ?? updatedSettings.showCoverageOnLoad;
    this.coverageOverlay.dispose();

    this.coverageOverlay = new CoverageOverlay(
      this.vscodeContext,
      this.coverageMapProvider,
      updatedSettings.showCoverageOnLoad,
      updatedSettings.coverageFormatter,
      updatedSettings.coverageColors
    );
    this.extContext.runnerWorkspace.collectCoverage = showCoverage;
    this.coverageOverlay.enabled = showCoverage;

    return this.startSession(true);
  }

  updateDecorators(testResults: SortedTestResults, editor: vscode.TextEditor): void {
    // Status indicators (gutter icons)
    const styleMap = [
      {
        data: testResults.success,
        decorationType: this.decorations.passing,
        state: TestReconciliationState.KnownSuccess,
      },
      {
        data: testResults.fail,
        decorationType: this.decorations.failing,
        state: TestReconciliationState.KnownFail,
      },
      {
        data: testResults.skip,
        decorationType: this.decorations.skip,
        state: TestReconciliationState.KnownSkip,
      },
      {
        data: testResults.unknown,
        decorationType: this.decorations.unknown,
        state: TestReconciliationState.Unknown,
      },
    ];

    styleMap.forEach((style) => {
      const decorators = this.generateDotsForItBlocks(style.data, style.state);
      editor.setDecorations(style.decorationType, decorators);
    });

    // Debug CodeLens
    this.debugCodeLensProvider.didChange();

    // Inline error messages
    this.resetInlineErrorDecorators(editor);
    if (this.extContext.settings.enableInlineErrorMessages) {
      const fileName = editor.document.fileName;
      testResults.fail.forEach((a) => {
        const { style, decorator } = this.generateInlineErrorDecorator(fileName, a);
        editor.setDecorations(style, [decorator]);
      });
    }
  }

  private isSupportedDocument(document: vscode.TextDocument | undefined): boolean {
    if (!document) {
      return false;
    }

    // if no testFiles list, then error on including more possible files as long as they are in the supported languages - this is backward compatible with v3 logic
    return SupportedLanguageIds.includes(document.languageId);
  }

  private isTestFileEditor(editor: vscode.TextEditor): boolean {
    if (!this.isSupportedDocument(editor.document)) {
      return false;
    }

    if (this.testFiles) {
      return this.testFiles.includes(editor.document.fileName);
    }

    // if no testFiles list, then error on including more possible files
    return true;
  }

  public deactivate(): void {
    this.stopSession();
    this.channel.dispose();
  }

  //**  commands */
  public debugTests = async (
    document: vscode.TextDocument,
    ...ids: DebugTestIdentifier[]
  ): Promise<void> => {
    const idString = (type: IdStringType, id: DebugTestIdentifier): string =>
      typeof id === 'string' ? id : testIdString(type, id);
    const selectTest = async (
      testIdentifiers: DebugTestIdentifier[]
    ): Promise<DebugTestIdentifier | undefined> => {
      const items: RunTestPickItem[] = testIdentifiers.map((id) => ({
        label: idString('display-reverse', id),
        id,
      }));
      const selected = await vscode.window.showQuickPick<RunTestPickItem>(items, {
        placeHolder: 'select a test to debug',
      });

      return selected?.id;
    };
    let testId: DebugTestIdentifier | undefined;
    switch (ids.length) {
      case 0:
        return;
      case 1:
        testId = ids[0];
        break;
      default:
        testId = await selectTest(ids);
        break;
    }

    if (!testId) {
      return;
    }

    this.debugConfigurationProvider.prepareTestRun(
      document.fileName,
      escapeRegExp(idString('full-name', testId))
    );

    try {
      // try to run the debug configuration from launch.json
      await vscode.debug.startDebugging(this.extContext.workspace, 'vscode-jest-tests');
    } catch {
      // if that fails, there (probably) isn't any debug configuration (at least no correctly named one)
      // therefore debug the test using the default configuration
      const debugConfiguration = this.debugConfigurationProvider.provideDebugConfigurations(
        this.extContext.workspace
      )[0];
      await vscode.debug.startDebugging(this.extContext.workspace, debugConfiguration);
    }
  };
  public runAllTests(editor?: vscode.TextEditor): void {
    if (!editor) {
      this.processSession.scheduleProcess({ type: 'all-tests' });
      this.dirtyFiles.clear();
    } else {
      const name = editor.document.fileName;
      this.dirtyFiles.delete(name);
      this.processSession.scheduleProcess({
        type: 'by-file',
        testFileNamePattern: name,
      });
    }
  }

  //**  window events handling */

  onDidCloseTextDocument(document: vscode.TextDocument): void {
    this.removeCachedTestResults(document);
    this.removeCachedDecorationTypes(document);
  }

  removeCachedTestResults(document: vscode.TextDocument, invalidateResult = false): void {
    if (!document || document.isUntitled) {
      return;
    }

    const filePath = document.fileName;
    if (invalidateResult) {
      this.testResultProvider.invalidateTestResults(filePath);
    } else {
      this.testResultProvider.removeCachedResults(filePath);
    }
  }

  removeCachedDecorationTypes(document: vscode.TextDocument): void {
    if (!document || !document.fileName) {
      return;
    }

    delete this.failingAssertionDecorators[document.fileName];
  }

  onDidChangeActiveTextEditor(editor: vscode.TextEditor): void {
    this.triggerUpdateActiveEditor(editor);
  }

  private handleOnSaveRun(document: vscode.TextDocument): void {
    if (!this.isSupportedDocument(document) || this.extContext.autoRun.isWatch) {
      return;
    }
    if (
      this.extContext.autoRun.onSave &&
      (this.extContext.autoRun.onSave === 'any-file' ||
        !this.testFiles ||
        this.testFiles.includes(document.fileName))
    ) {
      this.processSession.scheduleProcess({
        type: 'by-file',
        testFileNamePattern: document.fileName,
      });
    } else {
      this.dirtyFiles.add(document.fileName);
    }
  }

  /**
   * This event is fired with the document not dirty when:
   * - before the onDidSaveTextDocument event
   * - the document was changed by an external editor
   */
  onDidChangeTextDocument(event: vscode.TextDocumentChangeEvent): void {
    if (event.document.isDirty) {
      return;
    }
    if (event.document.uri.scheme === 'git') {
      return;
    }

    // Ignore a clean file with a change:
    if (event.contentChanges.length > 0) {
      return;
    }

    this.removeCachedTestResults(event.document, true);

    for (const editor of vscode.window.visibleTextEditors) {
      if (editor.document === event.document) {
        this.triggerUpdateActiveEditor(editor);
      }
    }

    this.handleOnSaveRun(event.document);
    this.updateStatusBar({
      stats: this.toSBStats(this.testResultProvider.getTestSuiteStats()),
    });
  }

  private updateTestFileList(): void {
    this.processSession.scheduleProcess({
      type: 'list-test-files',
      onResult: (files, error) => {
        this.setTestFiles(files);
        this.logging('debug', `found ${files?.length} testFiles`);
        if (error) {
          this.logging('error', 'failed to update test file list:', error);
          messaging.systemWarningMessage(
            'Failed to obtain test file list, something might not be setup right?',
            messaging.showTroubleshootingAction
          );
        }
      },
    });
  }

  onDidCreateFiles(_event: vscode.FileCreateEvent): void {
    this.updateTestFileList();
  }
  onDidRenameFiles(_event: vscode.FileRenameEvent): void {
    this.updateTestFileList();
  }
  onDidDeleteFiles(_event: vscode.FileDeleteEvent): void {
    this.updateTestFileList();
  }

  toggleCoverageOverlay(): void {
    this.coverageOverlay.toggleVisibility();

    // restart jest since coverage condition has changed
    this.triggerUpdateSettings(this.extContext.settings);
  }

  private resetInlineErrorDecorators(editor: vscode.TextEditor): void {
    if (!this.failingAssertionDecorators[editor.document.fileName]) {
      this.failingAssertionDecorators[editor.document.fileName] = [];
      return;
    }

    if (isOpenInMultipleEditors(editor.document)) {
      return;
    }

    this.failingAssertionDecorators[editor.document.fileName].forEach((element) => {
      element.dispose();
    });
    this.failingAssertionDecorators[editor.document.fileName] = [];
  }

  private generateInlineErrorDecorator(
    fileName: string,
    test: TestResult
  ): { decorator: vscode.DecorationOptions; style: vscode.TextEditorDecorationType } {
    const errorMessage = test.terseMessage || test.shortMessage;
    // TODO use better typing to indicate for error TestResult, the lineNumberOfError and errorMessage should never be null
    const decorator = {
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
      range: new vscode.Range(test.lineNumberOfError!, 0, test.lineNumberOfError!, 0),
    };

    // We have to make a new style for each unique message, this is
    // why we have to remove off of them beforehand
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    const style = inlineErrorStyle(errorMessage!);
    this.failingAssertionDecorators[fileName].push(style);

    return { style, decorator };
  }

  private setupStatusBar(): void {
    this.updateStatusBar({ state: 'initial' });
  }

  private resetStatusBar(): void {
    const modes: Mode[] = [];
    if (this.coverageOverlay.enabled) {
      modes.push('coverage');
    }
    modes.push(this.extContext.autoRun.mode);

    this.updateStatusBar({ state: 'initial', mode: modes, stats: emptyTestStats() });
  }
  private updateStatusBar(status: StatusBarUpdate): void {
    this.status.update(status);
  }

  _updateCoverageMap(coverageMap?: CoverageMapData): Promise<void> {
    return this.coverageMapProvider.update(coverageMap).then(() => {
      this.coverageCodeLensProvider.coverageChanged();
      this.coverageOverlay.updateVisibleEditors();
    });
  }
  private updateWithData(data: JestTotalResults): void {
    const noAnsiData = resultsWithoutAnsiEscapeSequence(data);
    const normalizedData = resultsWithLowerCaseWindowsDriveLetters(noAnsiData);
    this._updateCoverageMap(normalizedData.coverageMap);

    const statusList = this.testResultProvider.updateTestResults(normalizedData);
    updateDiagnostics(statusList, this.failDiagnostics);

    const stats = this.testResultProvider.getTestSuiteStats();
    this.updateStatusBar({ stats: this.toSBStats(stats) });

    for (const editor of vscode.window.visibleTextEditors) {
      if (vscode.workspace.getWorkspaceFolder(editor.document.uri) === this.extContext.workspace) {
        this.triggerUpdateActiveEditor(editor);
      }
    }
  }

  private generateDotsForItBlocks(
    blocks: TestResult[],
    state: TestReconciliationStateType
  ): DecorationOptions[] {
    return blocks.map((it) => ({
      range: new vscode.Range(it.start.line, it.start.column, it.start.line, it.start.column + 1),
      hoverMessage: TestResultStatusInfo[state].desc,
      identifier: it.name,
    }));
  }
}
