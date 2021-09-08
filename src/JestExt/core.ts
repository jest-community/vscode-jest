import * as vscode from 'vscode';
import { JestTotalResults } from 'jest-editor-support';

import { TestStatus } from '../decorations/test-status';
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
import { CoverageOverlay } from '../Coverage/CoverageOverlay';
import { resultsWithoutAnsiEscapeSequence } from '../TestResults/TestResult';
import { CoverageMapData } from 'istanbul-lib-coverage';
import { Logging } from '../logging';
import { createProcessSession, ProcessSession } from './process-session';
import {
  DebugFunction,
  JestExtContext,
  JestSessionEvents,
  JestExtSessionContext,
  JestRunEvent,
} from './types';
import * as messaging from '../messaging';
import { SupportedLanguageIds } from '../appGlobals';
import { createJestExtContext, getExtensionResourceSettings, prefixWorkspace } from './helper';
import { PluginResourceSettings } from '../Settings';
import { startWizard, WizardTaskId } from '../setup-wizard';
import { JestExtExplorerContext } from '../test-provider/types';
import { JestTestProvider } from '../test-provider';
import { JestProcessInfo } from '../JestProcessManagement';

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

  private decorations: TestStatus;

  // The ability to show fails in the problems section
  private failDiagnostics: vscode.DiagnosticCollection;

  // We have to keep track of our inline assert fails to remove later

  private processSession: ProcessSession;
  private vscodeContext: vscode.ExtensionContext;

  private status: ReturnType<StatusBar['bind']>;
  private logging: Logging;
  private extContext: JestExtContext;
  private dirtyFiles: Set<string> = new Set();

  private testProvider?: JestTestProvider;
  public events: JestSessionEvents;

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

    this.events = {
      onRunEvent: new vscode.EventEmitter<JestRunEvent>(),
      onTestSessionStarted: new vscode.EventEmitter<JestExtSessionContext>(),
      onTestSessionStopped: new vscode.EventEmitter<void>(),
    };
    this.setupRunEvents(this.events);

    this.testResultProvider = new TestResultProvider(
      this.events,
      pluginSettings.debugMode ?? false
    );

    this.debugConfigurationProvider = debugConfigurationProvider;

    this.status = statusBar.bind(workspaceFolder.name);

    // The theme stuff
    this.decorations = new TestStatus(vscodeContext);
    // reset the jest diagnostics
    resetDiagnostics(this.failDiagnostics);

    this.processSession = this.createProcessSession();

    this.setupStatusBar();
  }

  private getExtExplorerContext(): JestExtExplorerContext {
    return {
      ...this.extContext,
      sessionEvents: this.events,
      session: this.processSession,
      testResolveProvider: this.testResultProvider,
      debugTests: this.debugTests,
    };
  }
  private setupWizardAction(taskId: WizardTaskId): messaging.MessageAction {
    return {
      title: 'Run Setup Wizard',
      action: (): unknown =>
        startWizard(this.debugConfigurationProvider, {
          workspace: this.extContext.workspace,
          taskId,
          verbose: this.extContext.settings.debugMode,
        }),
    };
  }

  private setupRunEvents(events: JestSessionEvents): void {
    events.onRunEvent.event((event: JestRunEvent) => {
      switch (event.type) {
        case 'scheduled':
          this.channel.appendLine(`${event.process.id} is scheduled`);
          break;
        case 'data':
          if (event.newLine) {
            this.channel.appendLine(event.text);
          } else {
            this.channel.append(event.text);
          }
          if (event.isError) {
            this.channel.show();
          }
          break;
        case 'start':
          this.updateStatusBar({ state: 'running' });
          this.channel.clear();
          break;
        case 'end':
          this.updateStatusBar({ state: 'done' });
          break;
        case 'exit':
          if (event.error) {
            this.updateStatusBar({ state: 'stopped' });
            const msg = `${event.error}\n see troubleshooting: ${messaging.TROUBLESHOOTING_URL}`;
            this.channel.appendLine(msg);
            this.channel.show();
            messaging.systemErrorMessage(
              event.error,
              messaging.showTroubleshootingAction,
              this.setupWizardAction('cmdLine')
            );
          } else {
            this.updateStatusBar({ state: 'done' });
          }
          break;
      }
    });
  }

  private createProcessSession(): ProcessSession {
    return createProcessSession({
      ...this.extContext,
      updateWithData: this.updateWithData.bind(this),
      onRunEvent: this.events.onRunEvent,
    });
  }
  private toSBStats(stats: TestStats): SBTestStats {
    return { ...stats, isDirty: this.dirtyFiles.size > 0 };
  }
  private setTestFiles(list: string[] | undefined): void {
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

      this.testProvider?.dispose();
      if (this.extContext.settings.testExplorer.enabled) {
        this.testProvider = new JestTestProvider(this.getExtExplorerContext());
      }

      await this.processSession.start();

      this.events.onTestSessionStarted.fire({ ...this.extContext, session: this.processSession });

      this.updateTestFileList();
      this.channel.appendLine('Jest Session Started');
    } catch (e) {
      const msg = prefixWorkspace(this.extContext, 'Failed to start jest session');
      this.logging('error', `${msg}:`, e);
      this.channel.appendLine('Failed to start jest session');
      messaging.systemErrorMessage(
        `${msg}...`,
        messaging.showTroubleshootingAction,
        this.setupWizardAction('cmdLine')
      );
    }
  }

  public async stopSession(): Promise<void> {
    try {
      this.channel.appendLine('Stopping Jest Session');
      await this.processSession.stop();

      this.testProvider?.dispose();
      this.testProvider = undefined;

      this.events.onTestSessionStopped.fire();

      this.channel.appendLine('Jest Session Stopped');
      this.updateStatusBar({ state: 'stopped' });
    } catch (e) {
      const msg = prefixWorkspace(this.extContext, 'Failed to stop jest session');
      this.logging('error', `${msg}:`, e);
      this.channel.appendLine('Failed to stop jest session');
      messaging.systemErrorMessage('${msg}...', messaging.showTroubleshootingAction);
    }
  }

  /** update custom editor context used by vscode when clause, such as `jest:run.interactive` in package.json */
  private updateEditorContext(): void {
    const isInteractive = this.extContext.autoRun.isOff || !this.extContext.autoRun.isWatch;
    vscode.commands.executeCommand('setContext', 'jest:run.interactive', isInteractive);
  }
  private updateTestFileEditor(editor: vscode.TextEditor): void {
    if (!this.isTestFileEditor(editor)) {
      return;
    }

    const filePath = editor.document.fileName;
    let sortedResults: SortedTestResults | undefined;
    try {
      sortedResults = this.testResultProvider.getSortedResults(filePath);
    } catch (e) {
      this.channel.appendLine(`${filePath}: failed to parse test results: ${e}`);
      // assign an empty result so we can clear the outdated decorators/diagnostics etc
      sortedResults = {
        fail: [],
        skip: [],
        success: [],
        unknown: [],
      };
    }

    if (!sortedResults) {
      return;
    }

    this.updateDecorators(sortedResults, editor);
    updateCurrentDiagnostics(sortedResults.fail, this.failDiagnostics, editor);
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
    if (
      this.extContext.settings.testExplorer.enabled === false ||
      this.extContext.settings.testExplorer.showClassicStatus
    ) {
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
    }

    // Debug CodeLens
    this.debugCodeLensProvider.didChange();
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

    if (this.testResultProvider.isTestFile(editor.document.fileName) === 'no') {
      return false;
    }

    // if isTestFile returns unknown or true, treated it like a test file to give it best chance to display any test result if ever available
    return true;
  }

  public activate(): void {
    if (
      vscode.window.activeTextEditor?.document.uri &&
      vscode.workspace.getWorkspaceFolder(vscode.window.activeTextEditor.document.uri) ===
        this.extContext.workspace
    ) {
      this.onDidChangeActiveTextEditor(vscode.window.activeTextEditor);
    }
  }
  public deactivate(): void {
    this.stopSession();
    this.channel.dispose();

    this.testResultProvider.dispose();
    this.testProvider?.dispose();

    this.events.onRunEvent.dispose();
    this.events.onTestSessionStarted.dispose();
    this.events.onTestSessionStopped.dispose();
  }

  //**  commands */
  public debugTests: DebugFunction = async (
    document: vscode.TextDocument | string,
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
        placeHolder: 'Select a test to debug',
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
      typeof document === 'string' ? document : document.fileName,
      escapeRegExp(idString('full-name', testId))
    );

    let debugConfig = vscode.workspace
      .getConfiguration('launch', this.extContext.workspace.uri)
      ?.get<vscode.DebugConfiguration[]>('configurations')
      ?.filter((config) => config.name === 'vscode-jest-tests')[0];
    if (!debugConfig) {
      messaging.systemWarningMessage(
        prefixWorkspace(
          this.extContext,
          'No debug config named "vscode-jest-tests" found in launch.json, will use a default config.\nIf you encountered debugging problems, feel free to try the setup wizard below'
        ),
        this.setupWizardAction('debugConfig')
      );
      debugConfig = this.debugConfigurationProvider.provideDebugConfigurations(
        this.extContext.workspace
      )[0];
    }
    vscode.debug.startDebugging(this.extContext.workspace, debugConfig);
  };
  public runAllTests(editor?: vscode.TextEditor): void {
    if (!editor) {
      if (this.processSession.scheduleProcess({ type: 'all-tests' })) {
        this.dirtyFiles.clear();
        return;
      }
    } else {
      const name = editor.document.fileName;
      if (
        this.processSession.scheduleProcess({
          type: 'by-file',
          testFileName: name,
        })
      ) {
        this.dirtyFiles.delete(name);
        return;
      }
    }
    this.logging('error', 'failed to schedule the run for', editor?.document.fileName);
  }

  //**  window events handling */

  onDidCloseTextDocument(document: vscode.TextDocument): void {
    this.removeCachedTestResults(document);
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

  onDidChangeActiveTextEditor(editor: vscode.TextEditor): void {
    this.triggerUpdateActiveEditor(editor);
  }

  private handleOnSaveRun(document: vscode.TextDocument): void {
    if (!this.isSupportedDocument(document) || this.extContext.autoRun.isWatch) {
      return;
    }
    if (
      this.extContext.autoRun.onSave &&
      (this.extContext.autoRun.onSave === 'test-src-file' ||
        this.testResultProvider.isTestFile(document.fileName) !== 'no')
    ) {
      this.processSession.scheduleProcess({
        type: 'by-file',
        testFileName: document.fileName,
      });
    } else {
      this.dirtyFiles.add(document.fileName);
    }
  }

  /**
   * refresh UI for the given document editor or all active editors in the workspace
   * @param document refresh UI for the specific document. if undefined, refresh all active editors in the workspace.
   */
  private refreshDocumentChange(document?: vscode.TextDocument): void {
    for (const editor of vscode.window.visibleTextEditors) {
      if (
        (document && editor.document === document) ||
        vscode.workspace.getWorkspaceFolder(editor.document.uri) === this.extContext.workspace
      ) {
        this.triggerUpdateActiveEditor(editor);
      }
    }

    this.updateStatusBar({
      stats: this.toSBStats(this.testResultProvider.getTestSuiteStats()),
    });
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

    // there is a bit redudant since didSave already handle the save changes
    // but not sure if there are other non-editor related change we are trying
    // to capture, so leave it be for now...
    this.refreshDocumentChange(event.document);
  }

  onWillSaveTextDocument(event: vscode.TextDocumentWillSaveEvent): void {
    if (event.document.isDirty) {
      this.removeCachedTestResults(event.document, true);
    }
  }
  onDidSaveTextDocument(document: vscode.TextDocument): void {
    this.handleOnSaveRun(document);
    this.refreshDocumentChange(document);
  }

  private updateTestFileList(): void {
    this.processSession.scheduleProcess({
      type: 'list-test-files',
      onResult: (files, error) => {
        this.setTestFiles(files);
        this.logging('debug', `found ${files?.length} testFiles`);
        if (error) {
          const msg = prefixWorkspace(
            this.extContext,
            'Failed to obtain test file list, something might not be setup right?'
          );
          this.logging('error', msg, error);
          messaging.systemWarningMessage(
            msg,
            messaging.showTroubleshootingAction,
            this.setupWizardAction('cmdLine')
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
  private updateWithData(data: JestTotalResults, process: JestProcessInfo): void {
    const noAnsiData = resultsWithoutAnsiEscapeSequence(data);
    const normalizedData = resultsWithLowerCaseWindowsDriveLetters(noAnsiData);
    this._updateCoverageMap(normalizedData.coverageMap);

    const statusList = this.testResultProvider.updateTestResults(normalizedData, process);

    updateDiagnostics(statusList, this.failDiagnostics);

    this.refreshDocumentChange();
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
