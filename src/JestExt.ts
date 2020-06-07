import * as vscode from 'vscode';
import { ProjectWorkspace, JestTotalResults } from 'jest-editor-support';

import * as decorations from './decorations';
import { PluginResourceSettings } from './Settings';
import { statusBar, Status, StatusBar, Mode } from './StatusBar';
import {
  TestReconciliationState,
  TestResultProvider,
  TestResult,
  resultsWithLowerCaseWindowsDriveLetters,
  SortedTestResults,
} from './TestResults';
import { pathToJest, pathToConfig, cleanAnsi } from './helpers';
import { CoverageMapProvider, CoverageCodeLensProvider } from './Coverage';
import {
  updateDiagnostics,
  updateCurrentDiagnostics,
  resetDiagnostics,
  failedSuiteCount,
} from './diagnostics';
import { DebugCodeLensProvider } from './DebugCodeLens';
import { DebugConfigurationProvider } from './DebugConfigurationProvider';
import { DecorationOptions } from './types';
import { isOpenInMultipleEditors } from './editor';
import { CoverageOverlay } from './Coverage/CoverageOverlay';
import { JestProcess, JestProcessManager } from './JestProcessManagement';
import { isWatchNotSupported, WatchMode } from './Jest';
import * as messaging from './messaging';
import { resultsWithoutAnsiEscapeSequence } from './TestResults/TestResult';
import { CoverageMap, CoverageMapData } from 'istanbul-lib-coverage';

interface InstanceSettings {
  multirootEnv: boolean;
}

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

  private jestWorkspace: ProjectWorkspace;
  private pluginSettings: PluginResourceSettings;
  private workspaceFolder: vscode.WorkspaceFolder;
  private instanceSettings: InstanceSettings;

  // The ability to show fails in the problems section
  private failDiagnostics: vscode.DiagnosticCollection;

  private passingItStyle: vscode.TextEditorDecorationType;
  private failingItStyle: vscode.TextEditorDecorationType;
  private skipItStyle: vscode.TextEditorDecorationType;
  private unknownItStyle: vscode.TextEditorDecorationType;

  private parsingTestFile = false;

  // We have to keep track of our inline assert fails to remove later

  private jestProcessManager: JestProcessManager;
  private jestProcess: JestProcess;

  private status: ReturnType<StatusBar['bind']>;

  constructor(
    context: vscode.ExtensionContext,
    workspaceFolder: vscode.WorkspaceFolder,
    jestWorkspace: ProjectWorkspace,
    outputChannel: vscode.OutputChannel,
    pluginSettings: PluginResourceSettings,
    debugCodeLensProvider: DebugCodeLensProvider,
    debugConfigurationProvider: DebugConfigurationProvider,
    failDiagnostics: vscode.DiagnosticCollection,
    instanceSettings: InstanceSettings,
    coverageCodeLensProvider: CoverageCodeLensProvider
  ) {
    this.workspaceFolder = workspaceFolder;
    this.jestWorkspace = jestWorkspace;
    this.channel = outputChannel;
    this.failingAssertionDecorators = {};
    this.failDiagnostics = failDiagnostics;
    this.pluginSettings = pluginSettings;
    this.debugCodeLensProvider = debugCodeLensProvider;
    this.instanceSettings = instanceSettings;
    this.coverageCodeLensProvider = coverageCodeLensProvider;

    this.coverageMapProvider = new CoverageMapProvider();
    this.coverageOverlay = new CoverageOverlay(
      context,
      this.coverageMapProvider,
      pluginSettings.showCoverageOnLoad,
      pluginSettings.coverageFormatter
    );
    this.jestWorkspace.collectCoverage = pluginSettings.showCoverageOnLoad;

    this.testResultProvider = new TestResultProvider(this.pluginSettings.debugMode);
    this.debugConfigurationProvider = debugConfigurationProvider;

    this.jestProcessManager = new JestProcessManager({
      projectWorkspace: jestWorkspace,
      runAllTestsFirstInWatchMode: this.pluginSettings.runAllTestsFirst,
    });

    this.status = statusBar.bind(workspaceFolder.name);
    this.handleJestEditorSupportEvent = this.handleJestEditorSupportEvent.bind(this);

    // The theme stuff
    this.setupDecorators();
    // The bottom bar thing
    this.setupStatusBar();
    // reset the jest diagnostics
    resetDiagnostics(this.failDiagnostics);

    // If we should start the process by default, do so
    if (this.pluginSettings.autoEnable) {
      this.startProcess();
    } else {
      this.channel.appendLine('Skipping initial Jest runner process start.');
    }
  }

  public startProcess(): void {
    if (this.jestProcessManager.numberOfProcesses > 0) {
      // tslint:disable-next-line no-console
      console.warn(`process is already running, will not start a new process.`);
      return;
    }

    this.jestProcess = this.jestProcessManager.startJestProcess({
      watchMode: WatchMode.Watch,
      keepAlive: true,
      exitCallback: (jestProcess, jestProcessInWatchMode) => {
        if (jestProcessInWatchMode) {
          this.jestProcess = jestProcessInWatchMode;

          this.channel.appendLine('Finished running all tests. Starting watch mode.');
          this.updateStatusBar('running', 'Starting watch mode', false);

          this.assignHandlers(this.jestProcess);
        } else {
          this.updateStatusBar('stopped', undefined, false);
          if (!jestProcess.stopRequested()) {
            let msg = 'Starting Jest in Watch mode failed too many times and has been stopped.';
            if (this.instanceSettings.multirootEnv) {
              const folder = this.workspaceFolder.name;
              msg = `(${folder}) ${msg}\nIf this is expected, consider adding '${folder}' to disabledWorkspaceFolders`;
            }
            this.channel.appendLine(
              `${msg}\n see troubleshooting: ${messaging.TROUBLESHOOTING_URL}`
            );
            this.channel.show(true);
            messaging.systemErrorMessage(msg, messaging.showTroubleshootingAction);
          }
        }
      },
    });

    this.assignHandlers(this.jestProcess);
  }

  public stopProcess(): Promise<void> {
    this.channel.appendLine('Closing Jest');
    return this.jestProcessManager.stopAll().then(() => {
      this.updateStatusBar('stopped');
    });
  }

  public restartProcess(): Promise<void> {
    return this.stopProcess().then(() => {
      this.startProcess();
    });
  }

  public triggerUpdateActiveEditor(editor: vscode.TextEditor): void {
    this.coverageOverlay.updateVisibleEditors();

    if (!this.canUpdateActiveEditor(editor)) {
      return;
    }

    // not sure why we need to protect this block with parsingTestFile ?
    // using an ivar as a locking mechanism has bad smell
    // TODO: refactor maybe?
    this.parsingTestFile = true;

    const filePath = editor.document.fileName;
    const testResults = this.testResultProvider.getSortedResults(filePath);

    this.updateDecorators(testResults, editor);
    updateCurrentDiagnostics(testResults.fail, this.failDiagnostics, editor);

    this.parsingTestFile = false;
  }

  public triggerUpdateSettings(updatedSettings: PluginResourceSettings): void {
    this.pluginSettings = updatedSettings;

    this.jestWorkspace.rootPath = updatedSettings.rootPath;
    this.jestWorkspace.jestCommandLine = pathToJest(updatedSettings);
    this.jestWorkspace.pathToConfig = pathToConfig(updatedSettings);

    // debug
    this.jestWorkspace.debug = updatedSettings.debugMode;
    this.testResultProvider.verbose = updatedSettings.debugMode;

    // coverage
    const showCoverage =
      this.coverageOverlay.enabled === undefined
        ? updatedSettings.showCoverageOnLoad
        : this.coverageOverlay.enabled;
    this.jestWorkspace.collectCoverage = showCoverage;
    this.coverageOverlay.enabled = showCoverage;

    this.restartProcess();
  }

  updateDecorators(testResults: SortedTestResults, editor: vscode.TextEditor): void {
    // Dots
    const styleMap = [
      {
        data: testResults.success,
        decorationType: this.passingItStyle,
        state: TestReconciliationState.KnownSuccess,
      },
      {
        data: testResults.fail,
        decorationType: this.failingItStyle,
        state: TestReconciliationState.KnownFail,
      },
      {
        data: testResults.skip,
        decorationType: this.skipItStyle,
        state: TestReconciliationState.KnownSkip,
      },
      {
        data: testResults.unknown,
        decorationType: this.unknownItStyle,
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
    if (this.pluginSettings.enableInlineErrorMessages) {
      const fileName = editor.document.fileName;
      testResults.fail.forEach((a) => {
        const { style, decorator } = this.generateInlineErrorDecorator(fileName, a);
        editor.setDecorations(style, [decorator]);
      });
    }
  }

  canUpdateActiveEditor(editor: vscode.TextEditor): boolean {
    const inSettings = !editor.document;
    if (inSettings) {
      return false;
    }

    if (this.parsingTestFile) {
      return false;
    }

    // check if file is a possible code file: js/jsx/ts/tsx
    const codeRegex = /\.[t|j]sx?$/;
    return codeRegex.test(editor.document.uri.fsPath);
  }

  public deactivate(): void {
    this.jestProcessManager.stopAll();
  }

  public runTest = async (
    workspaceFolder: vscode.WorkspaceFolder,
    fileName: string,
    identifier: string
  ): Promise<void> => {
    const restart = this.jestProcessManager.numberOfProcesses > 0;
    this.jestProcessManager.stopAll();

    this.debugConfigurationProvider.prepareTestRun(fileName, identifier);

    const handle = vscode.debug.onDidTerminateDebugSession(() => {
      handle.dispose();
      if (restart) {
        this.startProcess();
      }
    });

    try {
      // try to run the debug configuration from launch.json
      await vscode.debug.startDebugging(workspaceFolder, 'vscode-jest-tests');
    } catch {
      // if that fails, there (probably) isn't any debug configuration (at least no correctly named one)
      // therefore debug the test using the default configuration
      const debugConfiguration = this.debugConfigurationProvider.provideDebugConfigurations(
        workspaceFolder
      )[0];
      await vscode.debug.startDebugging(workspaceFolder, debugConfiguration);
    }
  };

  onDidCloseTextDocument(document: vscode.TextDocument): void {
    this.removeCachedTestResults(document);
    this.removeCachedDecorationTypes(document);
  }

  removeCachedTestResults(document: vscode.TextDocument): void {
    if (!document || document.isUntitled) {
      return;
    }

    const filePath = document.fileName;
    this.testResultProvider.removeCachedResults(filePath);
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

    this.removeCachedTestResults(event.document);

    for (const editor of vscode.window.visibleTextEditors) {
      if (editor.document === event.document) {
        this.triggerUpdateActiveEditor(editor);
      }
    }
  }

  toggleCoverageOverlay(): void {
    this.coverageOverlay.toggleVisibility();

    // restart jest since coverage condition has changed
    this.triggerUpdateSettings(this.pluginSettings);
  }

  private detectedSnapshotErrors(): void {
    if (!this.pluginSettings.enableSnapshotUpdateMessages) {
      return;
    }
    vscode.window
      .showInformationMessage('Would you like to update your Snapshots?', { title: 'Replace them' })
      .then((response) => {
        // No response == cancel
        if (response) {
          this.jestProcess.runJestWithUpdateForSnapshots(() => {
            if (this.pluginSettings.restartJestOnSnapshotUpdate) {
              this.jestProcessManager.stopJestProcess(this.jestProcess).then(() => {
                this.startProcess();
              });
              vscode.window.showInformationMessage('Updated Snapshots and restarted Jest.');
            } else {
              vscode.window.showInformationMessage(
                'Updated Snapshots. It will show in your next test run.'
              );
            }
          });
        }
      });
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
    const decorator = {
      range: new vscode.Range(test.lineNumberOfError, 0, test.lineNumberOfError, 0),
    };

    // We have to make a new style for each unique message, this is
    // why we have to remove off of them beforehand
    const style = decorations.failingAssertionStyle(errorMessage);
    this.failingAssertionDecorators[fileName].push(style);

    return { style, decorator };
  }

  private handleStdErr(error: Buffer): void {
    const message = error.toString();
    if (this.shouldIgnoreOutput(message)) {
      return;
    }

    if (isWatchNotSupported(message)) {
      this.jestProcess.watchMode = WatchMode.WatchAll;
    }

    const noANSI = cleanAnsi(message);
    if (/(snapshots? failed)|(snapshot test failed)/i.test(noANSI)) {
      this.detectedSnapshotErrors();
    }

    this.channel.appendLine(noANSI);
  }

  private handleJestEditorSupportEvent(output: string): void {
    if (output.includes('onRunStart')) {
      this.channel.clear();
      this.updateStatusBar('running', 'Running tests', false);
    }
    if (output.includes('onRunComplete')) {
      this.updateStatusBar('stopped', undefined, false);
      this.parsingTestFile = false;
    }

    if (!this.shouldIgnoreOutput(output)) {
      this.channel.appendLine(output);
    }
  }

  private assignHandlers(jestProcess: JestProcess): void {
    jestProcess
      .onJestEditorSupportEvent('executableJSON', (data: JestTotalResults) => {
        this.updateWithData(data);
      })
      .onJestEditorSupportEvent('executableOutput', this.handleJestEditorSupportEvent)
      .onJestEditorSupportEvent('executableStdErr', (error: Buffer) => this.handleStdErr(error))
      .onJestEditorSupportEvent('nonTerminalError', (error: string) => {
        this.channel.appendLine(`Received an error from Jest Runner: ${error.toString()}`);
        this.channel.show(true);
      })
      .onJestEditorSupportEvent('exception', (result) => {
        this.channel.appendLine(`\nException raised: [${result.type}]: ${result.message}\n`);
        this.channel.show(true);
      })
      .onJestEditorSupportEvent('terminalError', (error: string) => {
        this.channel.appendLine('\nException raised: ' + error);
        this.channel.show(true);
      });
  }

  private setupStatusBar(): void {
    this.updateStatusBar('initial', undefined, false);
  }

  private updateStatusBar(status: Status, details?: string, watchMode = true): void {
    const modes: Mode[] = [];
    if (this.coverageOverlay.enabled) {
      modes.push('coverage');
    }
    if (watchMode) {
      modes.push('watch');
    }
    this.status.update(status, details, modes);
  }

  private setupDecorators(): void {
    this.passingItStyle = decorations.passingItName();
    this.failingItStyle = decorations.failingItName();
    this.skipItStyle = decorations.skipItName();
    this.unknownItStyle = decorations.notRanItName();
  }

  private shouldIgnoreOutput(text: string): boolean {
    // this fails when snapshots change - to be revised - returning always false for now
    return (
      text.includes('Watch Usage') || text.includes('onRunComplete') || text.includes('onRunStart')
    );
  }

  _updateCoverageMap(coverageMap: CoverageMap | CoverageMapData): Promise<void> {
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

    const failedFileCount = failedSuiteCount(this.failDiagnostics);
    if (failedFileCount <= 0 && normalizedData.success) {
      this.updateStatusBar('success');
    } else {
      this.updateStatusBar(
        'failed',
        ` (${failedFileCount} test suite${failedFileCount > 1 ? 's' : ''} failed)`
      );
    }

    for (const editor of vscode.window.visibleTextEditors) {
      if (vscode.workspace.getWorkspaceFolder(editor.document.uri) === this.workspaceFolder) {
        this.triggerUpdateActiveEditor(editor);
      }
    }
  }

  private generateDotsForItBlocks(
    blocks: TestResult[],
    state: TestReconciliationState
  ): DecorationOptions[] {
    const nameForState = {
      [TestReconciliationState.KnownSuccess]: 'Passed',
      [TestReconciliationState.KnownFail]: 'Failed',
      [TestReconciliationState.KnownSkip]: 'Skipped',
      [TestReconciliationState.Unknown]:
        'Test has not run yet, due to Jest only running tests related to changes.',
    };

    return blocks.map((it) => {
      return {
        range: new vscode.Range(it.start.line, it.start.column, it.start.line, it.start.column + 1),
        hoverMessage: nameForState[state],
        identifier: it.name,
      };
    });
  }
}
