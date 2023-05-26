import * as vscode from 'vscode';
import { JestTotalResults } from 'jest-editor-support';

import { statusBar, StatusBar, Mode, StatusBarUpdate, SBTestStats } from '../StatusBar';
import {
  TestResultProvider,
  resultsWithLowerCaseWindowsDriveLetters,
  SortedTestResults,
  TestResultProviderOptions,
} from '../TestResults';
import {
  testIdString,
  IdStringType,
  escapeRegExp,
  emptyTestStats,
  getValidJestCommand,
} from '../helpers';
import { CoverageMapProvider, CoverageCodeLensProvider } from '../Coverage';
import { updateDiagnostics, updateCurrentDiagnostics, resetDiagnostics } from '../diagnostics';
import { DebugConfigurationProvider } from '../DebugConfigurationProvider';
import { TestStats } from '../types';
import { CoverageOverlay } from '../Coverage/CoverageOverlay';
import { resultsWithoutAnsiEscapeSequence } from '../TestResults/TestResult';
import { CoverageMapData } from 'istanbul-lib-coverage';
import { Logging } from '../logging';
import { createProcessSession, ProcessSession } from './process-session';
import {
  JestExtContext,
  JestSessionEvents,
  JestExtSessionContext,
  JestRunEvent,
  DebugTestIdentifier,
} from './types';
import * as messaging from '../messaging';
import { extensionName, SupportedLanguageIds } from '../appGlobals';
import { createJestExtContext, getExtensionResourceSettings, prefixWorkspace } from './helper';
import { PluginResourceSettings } from '../Settings';
import { WizardTaskId } from '../setup-wizard';
import { ItemCommand, JestExtExplorerContext } from '../test-provider/types';
import { JestTestProvider } from '../test-provider';
import { JestProcessInfo } from '../JestProcessManagement';
import { addFolderToDisabledWorkspaceFolders } from '../extensionManager';
import { MessageAction } from '../messaging';
import { getExitErrorDef } from '../errors';
import { WorkspaceManager } from '../workspace-manager';
import { ansiEsc, JestOutputTerminal } from './output-terminal';

interface RunTestPickItem extends vscode.QuickPickItem {
  id: DebugTestIdentifier;
}

type MessageActionType =
  | 'help'
  | 'wizard'
  | 'disable-folder'
  | 'help-long-run'
  | 'setup-cmdline'
  | 'setup-monorepo';

interface JestCommandSettings {
  rootPath: string;
  jestCommandLine: string;
}
/** extract lines starts and end with [] */
export class JestExt {
  coverageMapProvider: CoverageMapProvider;
  coverageOverlay: CoverageOverlay;

  testResultProvider: TestResultProvider;
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

  private workspaceManager: WorkspaceManager;
  private output: JestOutputTerminal;
  private deubgConfig?: vscode.DebugConfiguration;

  constructor(
    vscodeContext: vscode.ExtensionContext,
    workspaceFolder: vscode.WorkspaceFolder,
    debugConfigurationProvider: DebugConfigurationProvider,
    coverageCodeLensProvider: CoverageCodeLensProvider
  ) {
    this.vscodeContext = vscodeContext;
    const pluginSettings = getExtensionResourceSettings(workspaceFolder.uri);
    this.output = new JestOutputTerminal(workspaceFolder.name);
    this.updateOutputSetting(pluginSettings);

    this.extContext = createJestExtContext(workspaceFolder, pluginSettings, this.output);
    this.logging = this.extContext.loggingFactory.create('JestExt');
    this.workspaceManager = new WorkspaceManager();

    this.failDiagnostics = vscode.languages.createDiagnosticCollection(
      `Jest (${workspaceFolder.name})`
    );
    this.coverageCodeLensProvider = coverageCodeLensProvider;

    this.coverageMapProvider = new CoverageMapProvider();
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
      this.testResultProviderOptions(pluginSettings)
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
      testResultProvider: this.testResultProvider,
      debugTests: this.debugTests,
    };
  }
  private setupWizardAction(taskId?: WizardTaskId): messaging.MessageAction {
    const command = `${extensionName}.setup-extension`;
    return {
      title: 'Fix',
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
      switch (event.type) {
        case 'start': {
          if (this.extContext.settings.autoRevealOutput === 'on-run') {
            this.output.reveal();
          }
          this.updateStatusBar({ state: 'running' });
          break;
        }
        case 'end': {
          const state = event.error ? 'exec-error' : 'done';
          this.updateStatusBar({ state });
          break;
        }
        case 'exit':
          if (event.error) {
            this.updateStatusBar({ state: 'exec-error' });
            messaging.systemErrorMessage(
              prefixWorkspace(this.extContext, event.error),
              ...this.buildMessageActions(['wizard', 'disable-folder', 'help'])
            );
          } else {
            this.updateStatusBar({ state: 'done' });
          }
          break;
        case 'data': {
          if (event.isError) {
            this.updateStatusBar({ state: 'exec-error' });
          }
          break;
        }
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
        case 'setup-cmdline':
          actions.push(this.setupWizardAction('cmdLine'));
          break;
        case 'setup-monorepo':
          actions.push(this.setupWizardAction('monorepo'));
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
      const readyState = await this.validateJestCommandLine();
      if (readyState !== 'pass') {
        return;
      }

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

      if (vscode.window.activeTextEditor) {
        this.triggerUpdateActiveEditor(vscode.window.activeTextEditor);
      }
    } catch (e) {
      const msg = prefixWorkspace(this.extContext, 'Failed to start jest session');
      this.logging('error', `${msg}:`, e);
      this.extContext.output.write('Failed to start jest session', 'error');
      messaging.systemErrorMessage(
        `${msg}...`,
        ...this.buildMessageActions(['wizard', 'disable-folder', 'help'])
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

    updateCurrentDiagnostics(sortedResults.fail, this.failDiagnostics, editor);
  }

  public triggerUpdateActiveEditor(editor: vscode.TextEditor): void {
    // there is use case that the active editor is not in the workspace but is in jest test file list
    if (!this.isInWorkspace(editor) && !this.isTestFileEditor(editor)) {
      return;
    }
    this.updateEditorContext();

    this.coverageOverlay.updateVisibleEditors();

    this.updateTestFileEditor(editor);
  }

  private updateOutputSetting(settings: PluginResourceSettings): void {
    this.output.revealOnError = settings.autoRevealOutput !== 'off';
    this.output.close();
  }
  private testResultProviderOptions(settings: PluginResourceSettings): TestResultProviderOptions {
    return {
      verbose: settings.debugMode ?? false,
      parserOptions: settings.parserPluginOptions
        ? { plugins: settings.parserPluginOptions }
        : undefined,
    };
  }
  public async triggerUpdateSettings(newSettings?: PluginResourceSettings): Promise<void> {
    const updatedSettings =
      newSettings ?? getExtensionResourceSettings(this.extContext.workspace.uri);

    // output
    if (this.extContext.settings.autoRevealOutput !== updatedSettings.autoRevealOutput) {
      this.updateOutputSetting(updatedSettings);
    }

    // TestResultProvider
    this.testResultProvider.options = this.testResultProviderOptions(updatedSettings);

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

    this.extContext = createJestExtContext(this.extContext.workspace, updatedSettings, this.output);
    this.deubgConfig = undefined;

    await this.startSession(true);
  }

  private isInWorkspace(editor: vscode.TextEditor): boolean {
    return vscode.workspace.getWorkspaceFolder(editor.document.uri) === this.extContext.workspace;
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

  /**
   * validate if there is a valid jest commandline. If the simple default command line is not valid,
   * it will take on a more
   *
   * @returns
   */
  public async validateJestCommandLine(): Promise<'pass' | 'fail' | 'restart'> {
    if (this.extContext.settings.jestCommandLine) {
      return Promise.resolve('pass');
    }

    const updateSettings = async (update: JestCommandSettings): Promise<'restart'> => {
      this.extContext.settings.jestCommandLine = update.jestCommandLine;
      this.extContext.settings.rootPath = update.rootPath;
      await this.triggerUpdateSettings(this.extContext.settings);
      return 'restart';
    };

    const outputSettings = (settings: JestCommandSettings) => {
      this.extContext.output.write(
        'found:\r\n' +
          `  ${ansiEsc('bold', 'rootPath')}: ${settings.rootPath}\r\n` +
          `  ${ansiEsc('bold', 'jestCommandLine')}: ${settings.jestCommandLine}\r\n`,
        'new-line'
      );
    };

    const t0 = Date.now();
    this.extContext.output.write('auto config:', 'info');
    const result = await getValidJestCommand(
      this.extContext.workspace,
      this.workspaceManager,
      this.extContext.settings.rootPath
    );
    const perf = Date.now() - t0;
    /* istanbul ignore next */
    if (perf > 2000) {
      this.extContext.output.write(
        `auto config took ${perf} msec. Might be more efficient to update settings directly`,
        'warn'
      );
    }

    const foundPackage = result.uris && result.uris.length > 0;
    if (foundPackage) {
      this.extContext.output.write(
        'examining the following package roots:\r\n' +
          `  ${result.uris?.map((uri) => uri.fsPath).join('\r\n  ')}`,
        'new-line'
      );
    }

    let msg = 'Not able to auto detect a valid jest command';
    let actionType: MessageActionType = 'setup-cmdline';

    switch (result.validSettings.length) {
      case 1:
        outputSettings(result.validSettings[0]);
        return updateSettings(result.validSettings[0]);
      case 0: {
        if (foundPackage) {
          this.extContext.output.write(
            'not able to find test script or jest/CRA binary in any of the package roots',
            'warn'
          );
        } else {
          this.extContext.output.write('no package.json file found', 'warn');
        }
        break;
      }
      default: {
        msg = `${msg}: multiple candidates found`;
        if (vscode.workspace.workspaceFolders?.length === 1) {
          msg += ' Perhaps this is a multi-root monorepo?';
          actionType = 'setup-monorepo';
        }
        break;
      }
    }

    messaging.systemErrorMessage(
      prefixWorkspace(this.extContext, msg),
      ...this.buildMessageActions([actionType, 'disable-folder', 'help'])
    );
    this.extContext.output.write(`Abort jest session: ${msg}`, 'error');
    this.updateStatusBar({ state: 'exec-error' });
    return 'fail';
  }
  /* istanbul ignore next */
  public activate(): void {
    // do nothing
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

    let debugConfig =
      getDebugConfig(this.extContext.workspace) ?? getDebugConfig() ?? this.deubgConfig;

    if (!debugConfig) {
      this.logging(
        'debug',
        'No debug config named "vscode-jest-tests.v2" or "vscode-jest-tests" found in launch.json, will use a default config.'
      );
      if (this.extContext.settings.jestCommandLine) {
        debugConfig = this.debugConfigurationProvider.withCommandLine(
          this.extContext.workspace,
          this.extContext.settings.jestCommandLine,
          this.extContext.settings.rootPath
        );
      } else {
        debugConfig = this.debugConfigurationProvider.provideDebugConfigurations(
          this.extContext.workspace
        )[0];
      }

      this.deubgConfig = debugConfig;
      this.extContext.output.write('auto config debug config:', 'info');
      this.extContext.output.write(JSON.stringify(debugConfig, undefined, '  '), 'new-line');
    }
    await vscode.debug.startDebugging(this.extContext.workspace, debugConfig);
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
        this.isInWorkspace(editor) ||
        this.isTestFileEditor(editor)
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

  toggleCoverageOverlay(): Promise<void> {
    this.coverageOverlay.toggleVisibility();

    // restart jest since coverage condition has changed
    return this.triggerUpdateSettings(this.extContext.settings);
  }
  toggleAutoRun(): Promise<void> {
    this.extContext.settings.autoRun.toggle();

    // restart jest since coverage condition has changed
    return this.triggerUpdateSettings(this.extContext.settings);
  }
  runItemCommand(testItem: vscode.TestItem, itemCommand: ItemCommand): void {
    this.testProvider?.runItemCommand(testItem, itemCommand);
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
