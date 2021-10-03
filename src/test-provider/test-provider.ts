import * as vscode from 'vscode';
import { JestTestProviderContext } from './test-provider-context';
import { WorkspaceRoot } from './test-item-data';
import { Debuggable, JestExtExplorerContext, TestItemData } from './types';
import { extensionId } from '../appGlobals';
import { Logging } from '../logging';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const isDebuggable = (arg: any): arg is Debuggable => arg && typeof arg.getDebugInfo === 'function';

export const RunProfileInfo: Record<vscode.TestRunProfileKind, string> = {
  [vscode.TestRunProfileKind.Run]: 'run',
  [vscode.TestRunProfileKind.Debug]: 'debug',
  [vscode.TestRunProfileKind.Coverage]: 'run with coverage',
};

export class JestTestProvider {
  private readonly controller: vscode.TestController;
  private context: JestTestProviderContext;
  private workspaceRoot: WorkspaceRoot;
  private log: Logging;

  constructor(jestContext: JestExtExplorerContext) {
    this.log = jestContext.loggingFactory.create('JestTestProvider');
    const wsFolder = jestContext.workspace;

    this.controller = this.createController(wsFolder, jestContext);

    this.context = new JestTestProviderContext(jestContext, this.controller);
    this.workspaceRoot = new WorkspaceRoot(this.context);
  }

  private createController = (
    wsFolder: vscode.WorkspaceFolder,
    jestContext: JestExtExplorerContext
  ): vscode.TestController => {
    const controller = vscode.tests.createTestController(
      `${extensionId}:TestProvider:${wsFolder.name}`,
      `Jest Test Provider (${wsFolder.name})`
    );

    controller.resolveHandler = this.discoverTest;
    if (!jestContext.autoRun.isWatch) {
      controller.createRunProfile('run', vscode.TestRunProfileKind.Run, this.runTests, true);
    }
    controller.createRunProfile('debug', vscode.TestRunProfileKind.Debug, this.runTests, true);
    controller.createRunProfile(
      'run with coverage',
      vscode.TestRunProfileKind.Coverage,
      this.runTests,
      true
    );

    return controller;
  };

  private discoverTest = (item: vscode.TestItem | undefined): void => {
    const theItem = item ?? this.workspaceRoot.item;
    if (!theItem.canResolveChildren) {
      return;
    }
    const run = this.context.createTestRun(
      new vscode.TestRunRequest([theItem]),
      `disoverTest: ${this.controller.id}`
    );
    const data = this.context.getData(theItem);
    run.appendOutput(
      `${
        data ? `resolving children for ${theItem.id}\r\n` : `no data found for item ${theItem.id}`
      }`
    );
    try {
      data?.discoverTest?.(run);
    } catch (e) {
      this.log('error', `[JestTestProvider]: discoverTest error for "${theItem.id}" : `, e);
      theItem.error = `discoverTest error: ${JSON.stringify(e)}`;
    } finally {
      run.end();
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
  debugTest = async (tData: TestItemData, run: vscode.TestRun): Promise<void> => {
    let error;
    if (isDebuggable(tData)) {
      try {
        const debugInfo = tData.getDebugInfo();
        this.context.appendOutput(`launching debugger for ${tData.item.id}`, run);
        await this.context.ext.debugTests(debugInfo.fileName, debugInfo.testNamePattern);
        return;
      } catch (e) {
        error = `item ${tData.item.id} failed to debug: ${JSON.stringify(e)}`;
      }
    }
    error = error ?? `item ${tData.item.id} is not debuggable`;
    run.errored(tData.item, new vscode.TestMessage(error));
    this.context.appendOutput(`${error}`, run, true, 'red');
    return Promise.resolve();
  };

  runTests = async (
    request: vscode.TestRunRequest,
    cancelToken: vscode.CancellationToken
  ): Promise<void> => {
    if (!request.profile) {
      this.log('error', 'not supporting runRequest without profile', request);
      return Promise.reject('cnot supporting runRequest without profile');
    }
    const profile = request.profile;

    const run = this.context.createTestRun(request, this.controller.id);
    const tests = (request.include ?? this.getAllItems()).filter(
      (t) => !request.exclude?.includes(t)
    );

    this.context.appendOutput(
      `executing profile: "${request.profile.label}" for ${tests.length} tests...`,
      run
    );
    const notRunnable: string[] = [];

    const promises: Promise<void>[] = [];
    try {
      for (const test of tests) {
        const tData = this.context.getData(test);
        if (!tData || cancelToken.isCancellationRequested) {
          run.skipped(test);
          continue;
        }
        if (!tData.canRun(profile)) {
          run.skipped(test);
          notRunnable.push(test.id);
          continue;
        }
        if (request.profile.kind === vscode.TestRunProfileKind.Debug) {
          await this.debugTest(tData, run);
        } else {
          promises.push(
            new Promise((resolve, reject) => {
              try {
                tData.scheduleTest(run, resolve, profile);
              } catch (e) {
                const msg = `failed to schedule test for ${tData.item.id}: ${JSON.stringify(e)}`;
                this.log('error', msg, e);
                run.errored(test, new vscode.TestMessage(msg));
                reject(msg);
              }
            })
          );
        }
      }

      // TODO: remove this when testItem can determine its run/debug eligibility, i.e. shows correct UI buttons.
      // for example: we only support debugging indivisual test, when users try to debug the whole test file or folder, it will be ignored
      // another example is to run indivisual test/test-file/folder in a watch-mode workspace is not necessary and thus will not be executed
      if (notRunnable.length > 0) {
        const msgs = [`the following items do not support "${request.profile.label}":`];
        notRunnable.forEach((id) => msgs.push(id));
        this.context.appendOutput(msgs.join('\n'), run);
        vscode.window.showWarningMessage(msgs.join('\r\n'));
      }
    } catch (e) {
      const msg = `failed to execute profile "${request.profile.label}": ${JSON.stringify(e)}`;
      this.context.appendOutput(msg, run, true, 'red');
    }

    await Promise.allSettled(promises);
    run.end();
  };

  dispose(): void {
    this.workspaceRoot.dispose();
    this.controller.dispose();
  }
}
