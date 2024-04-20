import * as vscode from 'vscode';
import { JestTestProviderContext } from './test-provider-context';
import { WorkspaceRoot } from './test-item-data';
import { Debuggable, ItemCommand, JestExtExplorerContext, TestItemData, TestTagId } from './types';
import { extensionId, extensionName } from '../appGlobals';
import { Logging } from '../logging';
import { toErrorString } from '../helpers';
import { tiContextManager } from './test-item-context-manager';
import { JestTestRun } from './jest-test-run';
import { JestTestCoverageProvider } from './test-coverage';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const isDebuggable = (arg: any): arg is Debuggable => arg && typeof arg.getDebugInfo === 'function';

export class JestTestProvider {
  private readonly controller: vscode.TestController;
  private context: JestTestProviderContext;
  private workspaceRoot: WorkspaceRoot;
  private log: Logging;
  private coverageProvider: JestTestCoverageProvider;

  constructor(jestContext: JestExtExplorerContext) {
    this.log = jestContext.loggingFactory.create('JestTestProvider');
    const wsFolder = jestContext.workspace;

    this.controller = this.createController(wsFolder);

    this.context = new JestTestProviderContext(
      jestContext,
      this.controller,
      this.createProfiles(this.controller)
    );
    this.workspaceRoot = new WorkspaceRoot(this.context);
    this.coverageProvider = new JestTestCoverageProvider(this.context.ext.sessionEvents);
    this.updateMenuContext();
  }

  private updateMenuContext() {
    tiContextManager.setItemContext({
      workspace: this.context.ext.workspace,
      key: 'jest.runMode',
      itemIds: [this.workspaceRoot.item.id],
    });
    tiContextManager.setItemContext({
      workspace: this.context.ext.workspace,
      key: 'jest.workspaceRoot',
      itemIds: [this.workspaceRoot.item.id],
    });
  }

  private createController = (wsFolder: vscode.WorkspaceFolder): vscode.TestController => {
    const controller = vscode.tests.createTestController(
      `${extensionId}:TestProvider:${wsFolder.name}`,
      `Jest Test Provider (${wsFolder.name})`
    );

    controller.resolveHandler = this.discoverTest;
    return controller;
  };
  private createProfiles = (controller: vscode.TestController): vscode.TestRunProfile[] => {
    const runTag = new vscode.TestTag(TestTagId.Run);
    const debugTag = new vscode.TestTag(TestTagId.Debug);
    const runProfile = controller.createRunProfile(
      'run tests',
      vscode.TestRunProfileKind.Run,
      this.runTests,
      true,
      runTag
    );
    runProfile.configureHandler = async () => {
      vscode.commands.executeCommand(
        `${extensionName}.with-workspace.change-run-mode`,
        this.context.ext.workspace
      );
    };
    const debugProfile = controller.createRunProfile(
      'debug tests',
      vscode.TestRunProfileKind.Debug,
      this.runTests,
      true,
      debugTag
    );
    const coverageProfile = controller.createRunProfile(
      'run tests with coverage',
      vscode.TestRunProfileKind.Coverage,
      this.runTests,
      false,
      runTag
    );
    coverageProfile.loadDetailedCoverage = this.loadDetailedCoverage;
    return [runProfile, debugProfile, coverageProfile];
  };

  private loadDetailedCoverage = async (
    _testRun: vscode.TestRun,
    fileCoverage: vscode.FileCoverage
  ): Promise<vscode.FileCoverageDetail[]> =>
    this.coverageProvider.loadDetailedCoverage(fileCoverage);

  private discoverTest = (item: vscode.TestItem | undefined): void => {
    const theItem = item ?? this.workspaceRoot.item;
    if (!theItem.canResolveChildren) {
      return;
    }
    const run = this.context.createTestRun(new vscode.TestRunRequest([theItem]), {
      name: `discoverTest: ${this.controller.id}`,
    });
    try {
      const data = this.context.getData(theItem);
      if (data && data.discoverTest) {
        data.discoverTest(run);
      } else {
        run.write(`no data found for item ${theItem.id}`, 'error');
      }
    } catch (e) {
      this.log('error', `[JestTestProvider]: discoverTest error for "${theItem.id}" : `, e);
      theItem.error = `discoverTest error: ${JSON.stringify(e)}`;
    } finally {
      run.end({ reason: 'discoverTest' });
    }
  };

  private getAllItems = (): vscode.TestItem[] => {
    const items: vscode.TestItem[] = [];
    this.controller.items.forEach((item) => items.push(item));
    return items;
  };

  /**
   * invoke JestExt debug function for the given data, handle unexpected exception and set item state accordingly.
   * should never throw or reject.
   */
  debugTest = async (tData: TestItemData, run: JestTestRun): Promise<void> => {
    let error;
    if (isDebuggable(tData)) {
      try {
        const debugInfo = tData.getDebugInfo();
        if (debugInfo.testNamePattern) {
          await this.context.ext.debugTests(debugInfo.fileName, debugInfo.testNamePattern);
        } else {
          await this.context.ext.debugTests(debugInfo.fileName);
        }
        return;
      } catch (e) {
        error = `item ${tData.item.id} failed to debug: ${JSON.stringify(e)}`;
      }
    }
    error = error ?? `item ${tData.item.id} is not debuggable`;
    run.errored(tData.item, new vscode.TestMessage(error));
    run.write(error, 'error');
    return Promise.resolve();
  };

  /**
   * Runs tests for the given test run request.
   * @param request - The test run request.
   * @param cancelToken - Optional cancellation token.
   * @param refreshRequest - Whether to rebuild the request based on current test tree. Defaults to false.
   * @returns A promise that resolves when all tests have been run.
   */
  runTests = async (
    request: vscode.TestRunRequest,
    cancelToken?: vscode.CancellationToken,
    refreshRequest = false
  ): Promise<void> => {
    if (this.context.ext.settings.runMode.config.deferred) {
      return vscode.commands.executeCommand(
        `${extensionName}.with-workspace.exit-defer-mode`,
        this.context.ext.workspace,
        { request, cancelToken }
      );
    }
    const req = refreshRequest ? this.context.requestFrom(request) : request;
    if (!req.profile) {
      const message = 'not supporting runRequest without profile';
      this.log('error', message, request);
      return Promise.reject(message);
    }

    const run = this.context.createTestRun(req, {
      name: `${request.profile?.label ?? 'runTest'}: ${this.controller.id}`,
    });

    cancelToken?.onCancellationRequested(() => {
      run.cancel();
    });

    const tests = (req.include ?? this.getAllItems()).filter((t) => !req.exclude?.includes(t));

    for (const test of tests) {
      const tData = this.context.getData(test);
      if (!tData || cancelToken?.isCancellationRequested) {
        run.skipped(test);
        continue;
      }
      if (req.profile.kind === vscode.TestRunProfileKind.Debug) {
        await this.debugTest(tData, run);
      } else {
        try {
          tData.scheduleTest(run, { profile: request.profile });
        } catch (e) {
          const msg = `failed to schedule test for ${tData.item.id}: ${toErrorString(e)}`;
          this.log('error', msg, e);
          run.errored(test, new vscode.TestMessage(msg));
        }
      }
    }

    run.end({ reason: 'runTests ends' });
  };

  public runItemCommand(testItem: vscode.TestItem, command: ItemCommand): void | Promise<void> {
    const data = this.context.getData(testItem);
    return data?.runItemCommand(command);
  }

  dispose(): void {
    this.workspaceRoot.dispose();
    this.controller.dispose();
    this.coverageProvider.dispose();
  }
}
