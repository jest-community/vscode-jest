import * as vscode from 'vscode';
import { JestTotalResults } from 'jest-editor-support';

import { statusBar, StatusBar, StatusBarUpdate, SBTestStats } from '../StatusBar';
import {
  TestResultProvider,
  resultsWithLowerCaseWindowsDriveLetters,
  SortedTestResults,
  TestResultProviderOptions,
} from '../TestResults';
import { escapeRegExp, emptyTestStats, getValidJestCommand } from '../helpers';
import { CoverageMapProvider, CoverageCodeLensProvider } from '../Coverage';
import { updateDiagnostics, updateCurrentDiagnostics, resetDiagnostics } from '../diagnostics';
import { DebugConfigurationProvider } from '../DebugConfigurationProvider';
import { TestExplorerRunRequest, TestNamePattern, TestStats } from '../types';
import { CoverageOverlay } from '../Coverage/CoverageOverlay';
import { resultsWithoutAnsiEscapeSequence } from '../TestResults/TestResult';
import { CoverageMapData } from 'istanbul-lib-coverage';
import { Logging } from '../logging';
import { createProcessSession, ProcessSession } from './process-session';
import { JestExtContext, JestSessionEvents, JestExtSessionContext, JestRunEvent } from './types';
import { extensionName, SupportedLanguageIds } from '../appGlobals';
import { createJestExtContext, getExtensionResourceSettings, prefixWorkspace } from './helper';
import { PluginResourceSettings } from '../Settings';
import { WizardTaskId } from '../setup-wizard';
import { ItemCommand, JestExtExplorerContext } from '../test-provider/types';
import { JestTestProvider } from '../test-provider';
import { JestProcessInfo } from '../JestProcessManagement';
import { getExitErrorDef } from '../errors';
import { WorkspaceManager, isInFolder } from '../workspace-manager';
import { ansiEsc, JestOutputTerminal } from './output-terminal';
import { QuickFixActionType } from '../quick-fix';
import { executableTerminalLinkProvider } from '../terminal-link-provider';
import { outputManager } from '../output-manager';

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
  private debugConfig?: vscode.DebugConfiguration;

  constructor(
    vscodeContext: vscode.ExtensionContext,
    workspaceFolder: vscode.WorkspaceFolder,
    debugConfigurationProvider: DebugConfigurationProvider,
    coverageCodeLensProvider: CoverageCodeLensProvider
  ) {
    this.vscodeContext = vscodeContext;
    this.output = new JestOutputTerminal(workspaceFolder.name);

    const pluginSettings = this.getExtensionResourceSettings(workspaceFolder);
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
      pluginSettings.runMode.config.coverage,
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

    this.status = statusBar.bind(workspaceFolder);

    // reset the jest diagnostics
    resetDiagnostics(this.failDiagnostics);

    this.processSession = this.createProcessSession();

    this.setupStatusBar();
  }

  public get name(): string {
    return this.extContext.workspace.name;
  }
  public get workspaceFolder(): vscode.WorkspaceFolder {
    return this.extContext.workspace;
  }

  /**
   * Gets the plugin resource settings for a workspace folder.
   * @param workspaceFolder The workspace folder to get the plugin resource settings for.
   * @returns The plugin resource settings for the workspace folder.
   * @throws An error if Jest is disabled for the workspace folder.
   */
  private getExtensionResourceSettings(
    workspaceFolder: vscode.WorkspaceFolder
  ): PluginResourceSettings {
    const pluginSettings = getExtensionResourceSettings(workspaceFolder);
    if (pluginSettings.enable === false) {
      throw new Error(`Jest is disabled for workspace ${workspaceFolder.name}`);
    }
    const { outputConfig, openTesting } = outputManager.outputConfigs();
    this.output.write(
      'Critical Settings:\r\n' +
        `jest.runMode: ${JSON.stringify(pluginSettings.runMode.config, undefined, 4)}\r\n` +
        `jest.outputConfig: ${JSON.stringify(outputConfig.value, undefined, 4)}\r\n` +
        `testing.openTesting: ${JSON.stringify(openTesting.value, undefined, 4)}\r\n`,
      'info'
    );
    return pluginSettings;
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

  public setupExtensionForFolder(args?: { taskId: WizardTaskId }): Thenable<void> {
    const command = `${extensionName}.setup-extension`;
    return vscode.commands.executeCommand(command, {
      workspace: this.extContext.workspace,
      taskId: args?.taskId,
      verbose: this.extContext.settings.debugMode,
    });
  }

  private longRunMessage(event: Extract<JestRunEvent, { type: 'long-run' }>): string {
    const messages = [`Long Running Tests Warning: Jest process "${event.process.request.type}"`];
    if (event.numTotalTestSuites != null) {
      messages.push(`for ${event.numTotalTestSuites} suites`);
    }
    messages.push(`has exceeded ${event.threshold}ms.`);

    return messages.join(' ');
  }

  private enableOutputOnRun(): void {
    outputManager.showOutputOn('run', this.output, this.extContext.settings.runMode);
  }
  private setupRunEvents(events: JestSessionEvents): void {
    events.onRunEvent.event((event: JestRunEvent) => {
      // only process the test running event
      if (event.process.request.type === 'not-test') {
        return;
      }
      this.enableOutputOnRun();

      switch (event.type) {
        case 'start': {
          this.updateStatusBar({ state: 'running' });
          break;
        }
        case 'end': {
          const state = event.error ? 'exec-error' : 'done';
          this.updateStatusBar({ state });

          // testError should be persistent per run-cycle. Not clear up this flag at end end of the cycle
          // could cause the processes with multiple run cycles, such as watch mode, to failed to act properly.
          if (event.process.userData?.testError) {
            event.process.userData.testError = undefined;
          }
          break;
        }
        case 'exit':
          if (event.error) {
            this.updateStatusBar({ state: 'exec-error' });
            if (!event.process.userData?.execError) {
              this.outputActionMessages(
                `Jest process exited unexpectedly: ${event.error}`,
                ['wizard', 'defer', 'disable-folder', 'help'],
                true,
                event.error
              );
              event.process.userData = { ...(event.process.userData ?? {}), execError: true };
            }
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
        case 'test-error': {
          if (!event.process.userData?.testError) {
            outputManager.showOutputOn('test-error', this.output, this.extContext.settings.runMode);
            event.process.userData = { ...(event.process.userData ?? {}), testError: true };
          }
          break;
        }
        case 'long-run': {
          this.outputActionMessages(this.longRunMessage(event), ['help-long-run'], false);
          break;
        }
      }
    });
  }

  private outputActionMessages = (
    errorMessage: string,
    actionTypes: QuickFixActionType[],
    isError: boolean,
    extra?: unknown
  ): void => {
    const msg = prefixWorkspace(this.extContext, errorMessage);
    this.logging(isError ? 'error' : 'warn', `${msg}:`, extra);
    this.output.write(errorMessage, isError ? 'error' : 'new-line');
    const quickFixLink = executableTerminalLinkProvider.executableLink(
      this.extContext.workspace.name,
      `${extensionName}.with-workspace.show-quick-fix`,
      actionTypes
    );
    this.output.write(`Open Quick Fix: \u2192 ${quickFixLink}`, 'info');
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
      if (this.extContext.settings.runMode.config.deferred) {
        // in deferred mode, we only start the test provider and nothing else
        this.testProvider?.dispose();
        this.testProvider = new JestTestProvider(this.getExtExplorerContext());
        this.resetStatusBar();

        this.updateVisibleTextEditors();
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

      const readyState = await this.validateJestCommandLine();
      if (readyState !== 'pass') {
        return;
      }

      await this.processSession.start();

      this.events.onTestSessionStarted.fire({ ...this.extContext, session: this.processSession });

      await this.updateTestFileList();

      // update visible editors that belong to this folder
      this.updateVisibleTextEditors();
    } catch (e) {
      this.outputActionMessages(
        `Failed to start jest session: ${e}`,
        ['wizard', 'defer', 'disable-folder', 'help'],
        true,
        e
      );
      this.updateStatusBar({ state: 'exec-error' });
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
      this.outputActionMessages(
        `Failed to stop jest session: ${e}`,
        ['defer', 'disable-folder', 'help'],
        true,
        e
      );
      this.updateStatusBar({ state: 'exec-error' });
    }
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

  private triggerUpdateActiveEditor(editor: vscode.TextEditor): void {
    this.coverageOverlay.update(editor);
    this.updateTestFileEditor(editor);
  }

  private updateOutputSetting(settings: PluginResourceSettings): void {
    this.output.revealOnError = !settings.runMode.config.deferred;
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
      newSettings ?? this.getExtensionResourceSettings(this.extContext.workspace);

    // output
    this.updateOutputSetting(updatedSettings);

    // TestResultProvider
    this.testResultProvider.options = this.testResultProviderOptions(updatedSettings);

    // coverage
    this.coverageOverlay.dispose();
    this.coverageOverlay = new CoverageOverlay(
      this.vscodeContext,
      this.coverageMapProvider,
      updatedSettings.runMode.config.coverage,
      updatedSettings.coverageFormatter,
      updatedSettings.coverageColors
    );

    this.extContext = createJestExtContext(this.extContext.workspace, updatedSettings, this.output);
    this.debugConfig = undefined;

    await this.startSession(true);
  }

  /**
   * Updates the valid text editors based on the specified document.
   * If a document is provided, it triggers an update for the active editor matches the document.
   * If no document is provided, it triggers an update for all editors that are in the workspace folder
   *
   * @param document The document to match against the active editor. Optional.
   */
  private updateVisibleTextEditors(document?: vscode.TextDocument): void {
    vscode.window.visibleTextEditors.forEach((editor) => {
      if (document) {
        if (editor.document === document) {
          this.triggerUpdateActiveEditor(editor);
        }
      } else if (this.isInWorkspaceFolder(editor)) {
        this.triggerUpdateActiveEditor(editor);
      }
    });
  }

  private isInWorkspaceFolder(editor: vscode.TextEditor): boolean {
    return isInFolder(editor.document.uri, this.extContext.workspace);
  }

  private isSupportedDocument(document?: vscode.TextDocument | undefined): boolean {
    // if no testFiles list, then error on including more possible files as long as they are in the supported languages - this is backward compatible with v3 logic
    return (document && SupportedLanguageIds.includes(document.languageId)) ?? false;
  }

  private isTestFileEditor(editor: vscode.TextEditor): boolean {
    if (!this.isSupportedDocument(editor.document)) {
      return false;
    }

    return this.testResultProvider.isTestFile(editor.document.fileName);
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
    let actionType: QuickFixActionType = 'setup-cmdline';

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

    this.outputActionMessages(msg, [actionType, 'defer', 'disable-folder', 'help'], true);
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
    statusBar.removeWorkspaceFolder(this.extContext.workspace);

    this.events.onRunEvent.dispose();
    this.events.onTestSessionStarted.dispose();
    this.events.onTestSessionStopped.dispose();
  }

  //**  commands */
  public debugTests = async (
    document: vscode.TextDocument | string,
    testNamePattern?: TestNamePattern
  ): Promise<void> => {
    const getDebugConfig = (
      folder?: vscode.WorkspaceFolder
    ): vscode.DebugConfiguration | undefined => {
      const configs = vscode.workspace
        .getConfiguration('launch', folder)
        ?.get<vscode.DebugConfiguration[]>('configurations');
      if (!configs) {
        return undefined;
      }

      const { sorted } = this.debugConfigurationProvider.getDebugConfigNames(
        this.extContext.workspace
      );
      for (const name of sorted) {
        const found = configs.find((c) => c.name === name);
        if (found) {
          return found;
        }
      }
    };

    this.debugConfigurationProvider.prepareTestRun(
      typeof document === 'string' ? document : document.fileName,
      testNamePattern ? escapeRegExp(testNamePattern) : '.*',
      this.extContext.workspace
    );

    let debugConfig =
      getDebugConfig(this.extContext.workspace) ?? getDebugConfig() ?? this.debugConfig;

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

      this.debugConfig = debugConfig;
      this.extContext.output.write('auto config debug config:', 'info');
      this.extContext.output.write(JSON.stringify(debugConfig, undefined, '  '), 'new-line');
    }
    await vscode.debug.startDebugging(this.extContext.workspace, debugConfig);
  };
  public async runAllTests(editor?: vscode.TextEditor): Promise<void> {
    this.enableOutputOnRun();
    await this.exitDeferMode();

    if (!editor) {
      if (this.processSession.scheduleProcess({ type: 'all-tests' })) {
        this.dirtyFiles.clear();
        return;
      }
    } else {
      const name = editor.document.fileName;
      let pInfo;
      if (!this.testResultProvider.isTestFile(name)) {
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
    if (
      !this.isSupportedDocument(document) ||
      this.extContext.settings.runMode.config.deferred ||
      this.extContext.settings.runMode.config.type !== 'on-save'
    ) {
      return;
    }
    const isTestFile = this.testResultProvider.isTestFile(document.fileName);

    if (!isTestFile && this.extContext.settings.runMode.config.testFileOnly) {
      // not a test file and configured not to re-run test for non-test files => mark the workspace dirty
      this.dirtyFiles.add(document.fileName);
    } else {
      this.processSession.scheduleProcess({
        type: 'by-file',
        testFileName: document.fileName,
        notTestFile: !isTestFile,
      });
    }
  }

  /**
   * refresh UI for the given document editor or all active editors in the workspace
   * @param document refresh UI for the specific document. if undefined, refresh all active editors in the workspace.
   */
  private refreshDocumentChange(document?: vscode.TextDocument): void {
    this.updateVisibleTextEditors(document);

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

    // there is a bit redundant since didSave already handle the save changes
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

  private async updateTestFileList(): Promise<void> {
    return new Promise((resolve, reject) => {
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
            reject(error);
          } else {
            resolve();
          }
        },
      });
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

  toggleCoverage(): Promise<void> {
    this.extContext.settings.runMode.toggleCoverage();
    return this.triggerUpdateSettings(this.extContext.settings);
  }
  // exit defer runMode
  async exitDeferMode(trigger?: TestExplorerRunRequest): Promise<void> {
    if (trigger) {
      this.enableOutputOnRun();
    }
    if (this.extContext.settings.runMode.config.deferred) {
      this.extContext.settings.runMode.exitDeferMode();
      this.extContext.output.write('exit defer mode', 'new-line');
      await this.triggerUpdateSettings(this.extContext.settings);
      if (trigger && this.testProvider) {
        try {
          await this.testProvider.runTests(trigger.request, trigger.token, true);
        } catch (e) {
          this.logging('error', 'failed to resume runs prior to defer mode', e);
          this.extContext.output.write(
            'failed to resume runs prior to defer mode, you might need to trigger the run again',
            'error'
          );
        }
      }
    }
  }

  async saveRunMode(): Promise<void> {
    try {
      await this.extContext.settings.runMode.save(this.extContext.workspace);
    } catch (e) {
      this.logging('error', 'failed to save runMode', e);
      this.extContext.output.write(
        'failed to save the runMode settings. ${e}. \r\nPlease report this error.',
        'error'
      );
    }
  }

  // this method is invoked by the TestExplorer UI
  async changeRunMode(): Promise<void> {
    const runMode = await this.extContext.settings.runMode.quickSwitch(this.vscodeContext);
    if (runMode) {
      const newSettings = { ...this.extContext.settings, runMode };
      return this.triggerUpdateSettings(newSettings);
    }
  }
  async runItemCommand(testItem: vscode.TestItem, itemCommand: ItemCommand): Promise<void> {
    this.enableOutputOnRun();
    await this.exitDeferMode();
    return this.testProvider?.runItemCommand(testItem, itemCommand);
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
    this.updateStatusBar({
      state: 'initial',
      mode: this.extContext.settings.runMode,
      stats: emptyTestStats(),
    });
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
