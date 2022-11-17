import * as vscode from 'vscode';
import { JestTotalResults } from 'jest-editor-support';

import { statusBar, StatusBar, Mode, StatusBarUpdate, SBTestStats } from '../StatusBar';
import {
  TestResultProvider,
  resultsWithLowerCaseWindowsDriveLetters,
  SortedTestResults,
} from '../TestResults';
import { testIdString, IdStringType, escapeRegExp, emptyTestStats } from '../helpers';
import { CoverageMapProvider, CoverageCodeLensProvider } from '../Coverage';
import { updateDiagnostics, updateCurrentDiagnostics, resetDiagnostics } from '../diagnostics';
import { DebugCodeLensProvider, DebugTestIdentifier } from '../DebugCodeLens';
import { DebugConfigurationProvider } from '../DebugConfigurationProvider';
import { TestStats } from '../types';
import { CoverageOverlay } from '../Coverage/CoverageOverlay';
import { resultsWithoutAnsiEscapeSequence } from '../TestResults/TestResult';
import { CoverageMapData } from 'istanbul-lib-coverage';
import { Logging } from '../logging';
import { createProcessSession, ProcessSession } from './process-session';
import { JestExtContext, JestSessionEvents, JestExtSessionContext, JestRunEvent } from './types';
import * as messaging from '../messaging';
import { extensionName, SupportedLanguageIds } from '../appGlobals';
import { createJestExtContext, getExtensionResourceSettings, prefixWorkspace } from './helper';
import { PluginResourceSettings } from '../Settings';
import { WizardTaskId } from '../setup-wizard';
import { JestExtExplorerContext } from '../test-provider/types';
import { JestTestProvider } from '../test-provider';
import { JestProcessInfo } from '../JestProcessManagement';
import { addFolderToDisabledWorkspaceFolders } from '../extensionManager';
import { MessageAction } from '../messaging';
import { getExitErrorDef } from '../errors';

interface RunTestPickItem extends vscode.QuickPickItem {
  id: DebugTestIdentifier;
}

type MessageActionType = 'help' | 'wizard' | 'disable-folder' | 'help-long-run';

/** extract lines starts and end with [] */
export class JestExt {
  coverageMapProvider: CoverageMapProvider;
  coverageOverlay: CoverageOverlay;

  testResultProvider: TestResultProvider;
  debugCodeLensProvider: DebugCodeLensProvider;
  debugConfigurationProvider: DebugConfigurationProvider;
  coverageCodeLensProvider: CoverageCodeLensProvider;

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

    // reset the jest diagnostics
    resetDiagnostics(this.failDiagnostics);

    this.processSession = this.createProcessSession();

    this.setupStatusBar();
  }

  public showOutput(): void {
    this.extContext.output.show();
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
  private setupWizardAction(taskId?: WizardTaskId): messaging.MessageAction {
    const command = `${extensionName}.setup-extension`;
    return {
      title: 'Run Setup Tool',
      action: (): unknown =>
        vscode.commands.executeCommand(command, {
          workspace: this.extContext.workspace,
          taskId,
          verbose: this.extContext.settings.debugMode,
        }),
    };
  }

  private setupIgnoreAction(): messaging.MessageAction {
    return {
      title: 'Ignore Folder',
      action: (): void => {
        addFolderToDisabledWorkspaceFolders(this.extContext.workspace.name);
      },
    };
  }
  private longRunMessage(event: Extract<JestRunEvent, { type: 'long-run' }>): string {
    const messages = [`Long Running Tests Warning: Jest process "${event.process.request.type}"`];
    if (event.numTotalTestSuites != null) {
      messages.push(`for ${event.numTotalTestSuites} suites`);
    }
    messages.push(`has exceeded ${event.threshold}ms.`);

    return messages.join(' ');
  }

  private setupRunEvents(events: JestSessionEvents): void {
    events.onRunEvent.event((event: JestRunEvent) => {
      // only process the test running event
      if (event.process.request.type === 'not-test') {
        return;
      }
      // console.log(
      //   `[core.onRunEvent] "${this.extContext.workspace.name}" event:${event.type} process:${event.process.id}`
      // );
      switch (event.type) {
        case 'start':
          this.updateStatusBar({ state: 'running' });
          break;
        case 'end':
          this.updateStatusBar({ state: 'done' });
          break;
        case 'exit':
          if (event.error) {
            this.updateStatusBar({ state: 'stopped' });
            messaging.systemErrorMessage(
              prefixWorkspace(this.extContext, event.error),
              ...this.buildMessageActions(['help', 'wizard', 'disable-folder'])
            );
          } else {
            this.updateStatusBar({ state: 'done' });
          }
          break;
        case 'long-run': {
          const msg = prefixWorkspace(this.extContext, this.longRunMessage(event));
          messaging.systemWarningMessage(msg, ...this.buildMessageActions(['help-long-run']));
          this.logging('warn', msg);
          break;
        }
      }
    });
  }

  private buildMessageActions = (types: MessageActionType[]): MessageAction[] => {
    const actions: MessageAction[] = [];
    for (const t of types) {
      switch (t) {
        case 'help':
          actions.push(messaging.showTroubleshootingAction);
          break;
        case 'wizard':
          actions.push(this.setupWizardAction());
          break;
        case 'disable-folder':
          if (vscode.workspace.workspaceFolders && vscode.workspace.workspaceFolders.length > 1) {
            actions.push(this.setupIgnoreAction());
          }
          break;
        case 'help-long-run':
          actions.push(messaging.showLongRunTroubleshootingAction);
          break;
      }
    }
    return actions;
  };
  private createProcessSession(): ProcessSession {
    const sessionContext = {
      ...this.extContext,
      updateWithData: this.updateWithData.bind(this),
      onRunEvent: this.events.onRunEvent,
    };
    return createProcessSession(sessionContext);
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
      }

      this.testProvider?.dispose();
      this.testProvider = new JestTestProvider(this.getExtExplorerContext());

      await this.processSession.start();

      this.events.onTestSessionStarted.fire({ ...this.extContext, session: this.processSession });

      this.updateTestFileList();
    } catch (e) {
      const msg = prefixWorkspace(this.extContext, 'Failed to start jest session');
      this.logging('error', `${msg}:`, e);
      this.extContext.output.write('Failed to start jest session', 'error');
      messaging.systemErrorMessage(
        `${msg}...`,
        ...this.buildMessageActions(['help', 'wizard', 'disable-folder'])
      );
    }
  }

  public async stopSession(): Promise<void> {
    try {
      await this.processSession.stop();

      this.testProvider?.dispose();
      this.testProvider = undefined;

      this.events.onTestSessionStopped.fire();

      this.updateStatusBar({ state: 'stopped' });
    } catch (e) {
      const msg = prefixWorkspace(this.extContext, 'Failed to stop jest session');
      this.logging('error', `${msg}:`, e);
      this.extContext.output.write('Failed to stop jest session', 'error');
      messaging.systemErrorMessage('${msg}...', ...this.buildMessageActions(['help']));
    }
  }

  /** update custom editor context used by vscode when clause, such as `jest:run.interactive` in package.json */
  private updateEditorContext(): void {
    // since v4.3, all autoRun modes supports interactive-run
    vscode.commands.executeCommand('setContext', 'jest:run.interactive', true);
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
      this.extContext.output.write(`${filePath}: failed to parse test results: ${e}`, 'error');
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

    this.updateDecorators();
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

    // debug
    this.testResultProvider.verbose = updatedSettings.debugMode ?? false;

    // coverage
    const showCoverage = this.coverageOverlay.enabled ?? updatedSettings.showCoverageOnLoad;
    updatedSettings.showCoverageOnLoad = showCoverage;

    this.coverageOverlay.dispose();
    this.coverageOverlay = new CoverageOverlay(
      this.vscodeContext,
      this.coverageMapProvider,
      updatedSettings.showCoverageOnLoad,
      updatedSettings.coverageFormatter,
      updatedSettings.coverageColors
    );

    this.extContext = createJestExtContext(this.extContext.workspace, updatedSettings);

    return this.startSession(true);
  }

  updateDecorators(): void {
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
    this.extContext.output.dispose();

    this.testResultProvider.dispose();
    this.testProvider?.dispose();

    this.events.onRunEvent.dispose();
    this.events.onTestSessionStarted.dispose();
    this.events.onTestSessionStopped.dispose();
  }

  //**  commands */
  public debugTests = async (
    document: vscode.TextDocument | string,
    ...ids: DebugTestIdentifier[]
  ): Promise<void> => {
    const idString = (type: IdStringType, id: DebugTestIdentifier): string =>
      typeof id === 'string' ? id : testIdString(type, id);
    const getDebugConfig = (
      folder?: vscode.WorkspaceFolder
    ): vscode.DebugConfiguration | undefined => {
      const configs = vscode.workspace
        .getConfiguration('launch', folder?.uri)
        ?.get<vscode.DebugConfiguration[]>('configurations');
      return (
        configs?.find((c) => c.name === 'vscode-jest-tests.v2') ??
        configs?.find((c) => c.name === 'vscode-jest-tests')
      );
    };
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
        //no testId, will run all tests in the file
        break;
      case 1:
        testId = ids[0];
        break;
      default:
        testId = await selectTest(ids);
        // if nothing is selected, abort
        if (!testId) {
          return;
        }
        break;
    }

    this.debugConfigurationProvider.prepareTestRun(
      typeof document === 'string' ? document : document.fileName,
      testId ? escapeRegExp(idString('full-name', testId)) : '.*'
    );

    let debugConfig = getDebugConfig(this.extContext.workspace) ?? getDebugConfig();

    if (!debugConfig) {
      this.logging(
        'debug',
        'No debug config named "vscode-jest-tests.v2" or "vscode-jest-tests" found in launch.json, will use a default config.'
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
      let pInfo;
      if (this.testResultProvider.isTestFile(name) !== 'yes') {
        // run related tests from source file
        pInfo = this.processSession.scheduleProcess({
          type: 'by-file',
          testFileName: name,
          notTestFile: true,
        });
      } else {
        // note: use file-pattern instead of file-path to increase compatibility, such as for angular users.
        // However, we should keep an eye on performance, as matching by pattern could be slower than by explicit path.
        // If performance ever become an issue, we could consider optimization...
        pInfo = this.processSession.scheduleProcess({
          type: 'by-file-pattern',
          testFileNamePattern: name,
        });
      }
      if (pInfo) {
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
    if (!this.isSupportedDocument(document) || this.extContext.settings.autoRun.isWatch) {
      return;
    }
    const isTestFile = this.testResultProvider.isTestFile(document.fileName);
    if (
      this.extContext.settings.autoRun.onSave &&
      (this.extContext.settings.autoRun.onSave === 'test-src-file' || isTestFile !== 'no')
    ) {
      this.processSession.scheduleProcess({
        type: 'by-file',
        testFileName: document.fileName,
        notTestFile: isTestFile !== 'yes',
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
      onResult: (files, error, exitCode) => {
        this.setTestFiles(files);
        this.logging('debug', `found ${files?.length} testFiles`);
        if (error) {
          const msg =
            'failed to retrieve test file list. TestExplorer might show incomplete test items';
          this.extContext.output.write(error, 'new-line');
          const errorType = getExitErrorDef(exitCode) ?? 'error';
          this.extContext.output.write(msg, errorType);
          this.logging('error', msg, error);
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
  toggleAutoRun(): void {
    this.extContext.settings.autoRun.toggle();

    // restart jest since coverage condition has changed
    this.triggerUpdateSettings(this.extContext.settings);
  }

  enableLoginShell(): void {
    if (this.extContext.settings.shell.useLoginShell) {
      return;
    }
    this.extContext.settings.shell.enableLoginShell();
    this.triggerUpdateSettings(this.extContext.settings);
    this.extContext.output.write(
      `possible process env issue detected, restarting with a login-shell...\r\n`,
      'warn'
    );
  }

  private setupStatusBar(): void {
    this.updateStatusBar({ state: 'initial' });
  }

  private resetStatusBar(): void {
    const modes: Mode[] = [];
    if (this.coverageOverlay.enabled) {
      modes.push('coverage');
    }
    modes.push(this.extContext.settings.autoRun.mode);

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
}
