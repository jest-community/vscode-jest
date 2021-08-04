import * as vscode from 'vscode';
import { JestTestProviderContext } from './test-provider-context';
import { WorkspaceRoot } from './test-item-data';
import { DebugFunction, Debuggable, JestExtResultContext, TestItemData } from './types';
import { extensionId } from '../appGlobals';
import { Logging } from '../logging';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const isDebuggable = (arg: any): arg is Debuggable => arg && typeof arg.getDebugInfo === 'function';

const resolveError = (
  run: vscode.TestRun,
  item: vscode.TestItem,
  error: string,
  resolve?: () => void
) => {
  run.errored(item, new vscode.TestMessage(error));
  run.appendOutput(`${error}\r\n`);
  return resolve ? resolve() : Promise.resolve();
};

/**
 * invoke JestExt debug function for the given data, handle unexpected exception and set item state accordingly.
 * should never throw or reject.
 */
export const debugTest = async (
  tData: TestItemData,
  run: vscode.TestRun,
  debugTests: DebugFunction
): Promise<void> => {
  let error;
  if (isDebuggable(tData)) {
    try {
      const debugInfo = tData.getDebugInfo();
      run.appendOutput(`launching debugger for ${tData.item.id}\r\n`);
      await debugTests(debugInfo.fileName, debugInfo.testNamePattern);
      return;
    } catch (e) {
      error = `item ${tData.item.id} failed to debug: ${JSON.stringify(e)}`;
    }
  }
  return resolveError(run, tData.item, error ?? `item ${tData.item.id} is not debuggable`);
};

/**
 * invoke data.scheduleTest, update scheduledTests cache and handle unexpected exception to set item state accordingly
 * should never throw or reject.
 */
export const runTest = (
  tData: TestItemData,
  run: vscode.TestRun,
  cancelToken: vscode.CancellationToken,
  context: JestTestProviderContext,
  profile: vscode.TestRunProfile
): Promise<void> => {
  if (cancelToken.isCancellationRequested) {
    run.skipped(tData.item);
    run.appendOutput(`test run for ${tData.item.id} is cancelled\r\n`);
    return Promise.resolve();
  }
  return new Promise<void>((resolve) => {
    let error;
    try {
      const pid = tData.scheduleTest(run, profile);
      if (pid) {
        run.appendOutput(`scheduled a test run for ${tData.item.id}: ${pid}\r\n`);
        const onDone = () => resolve();
        context.setScheduledTest(pid, { onDone, run, cancelToken });
        return;
      }
    } catch (e) {
      error = `schedule test ${tData.item.id} failed: ${JSON.stringify(e)}`;
    }
    return resolveError(
      run,
      tData.item,
      error ?? `failed to schedule the test run for: ${tData.item.id}`,
      resolve
    );
  });
};

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

  constructor(jestContext: JestExtResultContext, private readonly debugTests: DebugFunction) {
    this.log = jestContext.loggingFactory.create('JestTestProvider');
    const wsFolder = jestContext.workspace;

    this.controller = this.createController(wsFolder, jestContext);

    this.context = new JestTestProviderContext(jestContext, this.controller);
    this.workspaceRoot = new WorkspaceRoot(this.context);
  }

  private createController = (
    wsFolder: vscode.WorkspaceFolder,
    jestContext: JestExtResultContext
  ): vscode.TestController => {
    const controller = vscode.tests.createTestController(
      `${extensionId}/${wsFolder.name}`,
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
    const run = this.context.createTestRun(
      new vscode.TestRunRequest([theItem]),
      this.controller.id
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

  runTests = async (
    request: vscode.TestRunRequest,
    cancelToken: vscode.CancellationToken
  ): Promise<void> => {
    if (!request.profile) {
      this.log('error', 'not supporting runRequest without profile', request);
      return Promise.reject('cnot supporting runRequest without profile');
    }

    const run = this.context.createTestRun(request, this.controller.id);
    const tests = (request.include ?? this.getAllItems()).filter(
      (t) => !request.exclude?.includes(t)
    );

    run.appendOutput(
      `executing profile: "${request.profile.label}" for ${tests.length} tests...\r\n`
    );
    const notRunnable: string[] = [];

    cancelToken.onCancellationRequested(() => {
      this.log('debug', `run is cancelled:`, request);
      run.appendOutput(`run '${run.name}' is cancelled\r\n`);
      run.end();
    });
    const promises: Promise<void>[] = [];
    for (const test of tests) {
      const tData = this.context.getData(test);
      if (!tData || cancelToken.isCancellationRequested) {
        run.skipped(test);
        continue;
      }
      if (!tData.canRun(request.profile)) {
        run.skipped(test);
        notRunnable.push(test.id);
        continue;
      }
      if (request.profile.kind === vscode.TestRunProfileKind.Debug) {
        await debugTest(tData, run, this.debugTests);
      } else {
        promises.push(runTest(tData, run, cancelToken, this.context, request.profile));
      }
    }

    // TODO: remove this when testItem can determine its run/debug eligibility, i.e. shows correct UI buttons.
    // for example: we only support debugging indivisual test, when users try to debug the whole test file or folder, it will be ignored
    // another example is to run indivisual test/test-file/folder in a watch-mode workspace is not necessary and thus will not be executed
    if (notRunnable.length > 0) {
      const msgs = [`the following items do not support "${request.profile.label}":`];
      notRunnable.forEach((id) => msgs.push(id));
      const msg = msgs.join('\r\n');
      run.appendOutput(`${msg}\r\n`);
      vscode.window.showWarningMessage(msg);
    }

    await Promise.allSettled(promises);
    run.appendOutput(`run ${run.name} has completed\r\n`);
    run.end();
  };

  dispose(): void {
    this.workspaceRoot.dispose();
    this.controller.dispose();
  }
}
