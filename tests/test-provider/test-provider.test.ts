jest.unmock('../../src/test-provider/test-provider');
jest.unmock('../../src/test-provider/test-provider-context');
jest.unmock('./test-helper');
jest.unmock('../../src/appGlobals');

import * as vscode from 'vscode';
import { debugTest, JestTestProvider, runTest } from '../../src/test-provider/test-provider';
import { WorkspaceRoot } from '../../src/test-provider/test-item-data';
import { JestTestProviderContext } from '../../src/test-provider/test-provider-context';
import { extensionId } from '../../src/appGlobals';
import { mockController, mockResultContext, mockRun } from './test-helper';

const throwError = () => {
  throw new Error('debug error');
};

describe('debugTest', () => {
  beforeEach(() => {
    jest.resetAllMocks();
  });
  it.each`
    debugInfo                                          | debugTests                       | hasError
    ${undefined}                                       | ${() => Promise.resolve()}       | ${true}
    ${{ fileName: 'file', testNamePattern: 'a test' }} | ${() => Promise.resolve()}       | ${false}
    ${{ fileName: 'file', testNamePattern: 'a test' }} | ${() => Promise.reject('error')} | ${true}
    ${{ fileName: 'file', testNamePattern: 'a test' }} | ${throwError}                    | ${true}
  `(
    'debug test should already resolve: "$debugInfo" when debugTests = $debugTests => error? $hasError',
    async ({ debugInfo, debugTests, hasError }) => {
      expect.hasAssertions();
      const tData: any = {
        context: { workspace: {} },
        item: { id: 'whatever' },
        canRun: () => true,
      };
      if (debugInfo) {
        tData.getDebugInfo = jest.fn(() => debugInfo);
      }
      const runMock: any = {
        appendOutput: jest.fn(),
        appendMessage: jest.fn(),
        errored: jest.fn(),
      };
      const debugTestsMock = jest.fn(() => {
        if (debugTests) {
          return debugTests();
        }
      });

      await expect(debugTest(tData, runMock, debugTestsMock)).resolves.toBe(undefined);

      if (hasError) {
        expect(runMock.errored).toBeCalledWith(tData.item, expect.anything());
        expect(vscode.TestMessage).toBeCalledTimes(1);
      }
    }
  );
});
describe('runTest', () => {
  beforeEach(() => {
    jest.resetAllMocks();
  });
  it.each`
    pid           | isCancelled | state
    ${undefined}  | ${false}    | ${'errored'}
    ${'123'}      | ${false}    | ${undefined}
    ${'123'}      | ${true}     | ${'skipped'}
    ${throwError} | ${false}    | ${'errored'}
  `(
    'run test should always resolve: schedule test pid = $pid, isCancelled=$isCancelled => state? $state',
    async ({ pid, isCancelled, state }) => {
      const tData: any = {
        item: { id: 'whatever' },
        scheduleTest:
          typeof pid === 'string'
            ? jest.fn().mockReturnValueOnce(pid)
            : jest.fn().mockImplementation(pid),
      };
      const runMock: any = mockRun();
      const profile: any = { kind: vscode.TestRunProfileKind.Run };

      // const scheduledTests: Map<string, ScheduledTest> = new Map();
      const cancelToken: any = { isCancellationRequested: isCancelled };
      const context = new JestTestProviderContext({} as any, {} as any);
      const spy = jest.spyOn(context, 'setScheduledTest');

      const p = runTest(tData, runMock, cancelToken, context, profile);
      if (isCancelled) {
        expect(tData.scheduleTest).not.toBeCalled();
      } else {
        expect(tData.scheduleTest).toBeCalled();
        if (typeof pid === 'string') {
          expect(spy).toBeCalledTimes(1);
          const { onDone } = context.getScheduledTest(pid);
          expect(onDone).not.toBeUndefined();
          onDone();
        } else {
          expect(spy).toBeCalledTimes(0);
        }
      }

      await expect(p).resolves.toBe(undefined);
      switch (state) {
        case 'errored':
          expect(runMock.errored).toBeCalledWith(tData.item, expect.anything());
          expect(vscode.TestMessage).toBeCalledTimes(1);
          break;
        case 'skipped':
          expect(runMock.skipped).toBeCalledWith(tData.item);
          expect(vscode.TestMessage).not.toBeCalled();
          break;
        case undefined:
          break;
        default:
          expect('unhandled state type').toBeUndefined();
          break;
      }
    }
  );
});

describe('JestTestProvider', () => {
  const makeItemData = (debuggable = true) => {
    const data: any = {
      discoverTest: jest.fn(),
      scheduleTest: jest.fn(),
      dispose: jest.fn(),
      canRun: jest.fn().mockReturnValue(true),
    };
    if (debuggable) {
      data.getDebugInfo = jest.fn();
    }
    return data;
  };

  const setupTestItemData = (
    id: string,
    debuggable = true,
    context?: JestTestProviderContext
  ): any => {
    const data = makeItemData(debuggable);
    data.item = context?.createTestItem(id, id, {} as any, data) ?? { id };
    return data;
  };

  let controllerMock;
  let resultContextMock;
  let debugTestsMock;
  let workspaceRootMock;

  beforeEach(() => {
    jest.resetAllMocks();

    resultContextMock = mockResultContext();
    debugTestsMock = jest.fn();

    controllerMock = mockController();
    (vscode.tests.createTestController as jest.Mocked<any>).mockImplementation((id, label) => {
      controllerMock.id = id;
      controllerMock.label = label;
      return controllerMock;
    });

    (vscode.workspace.getWorkspaceFolder as jest.Mocked<any>).mockImplementation((uri) => ({
      name: uri,
    }));

    (WorkspaceRoot as jest.Mocked<any>).mockImplementation((context) => {
      workspaceRootMock = setupTestItemData('workspace-root', false, context);
      workspaceRootMock.activate = jest.fn();
      workspaceRootMock.context = context;
      return workspaceRootMock;
    });
  });

  describe('upon creation', () => {
    it('will setup controller and WorkspaceRoot', () => {
      new JestTestProvider(resultContextMock, debugTestsMock);

      expect(controllerMock.resolveHandler).not.toBeUndefined();
      expect(vscode.tests.createTestController).toHaveBeenCalledWith(
        `${extensionId}/ws-1`,
        expect.stringContaining('ws-1')
      );
      expect(controllerMock.createRunProfile).toHaveBeenCalledTimes(3);
      [
        vscode.TestRunProfileKind.Run,
        vscode.TestRunProfileKind.Debug,
        vscode.TestRunProfileKind.Coverage,
      ].forEach((kind) => {
        expect(controllerMock.createRunProfile).toHaveBeenCalledWith(
          expect.anything(),
          kind,
          expect.anything(),
          true
        );
      });

      expect(WorkspaceRoot).toBeCalled();
    });
    it.each`
      isWatchMode | createRunProfile
      ${true}     | ${false}
      ${false}    | ${true}
    `(
      'will createRunProfile($createRunProfile) if isWatchMode=$isWatchMode',
      ({ isWatchMode, createRunProfile }) => {
        resultContextMock.autoRun.isWatch = isWatchMode;
        new JestTestProvider(resultContextMock, debugTestsMock);
        const kinds = [vscode.TestRunProfileKind.Debug, vscode.TestRunProfileKind.Coverage];
        if (createRunProfile) {
          kinds.push(vscode.TestRunProfileKind.Run);
        }

        expect(controllerMock.createRunProfile).toHaveBeenCalledTimes(kinds.length);
        kinds.forEach((kind) => {
          expect(controllerMock.createRunProfile).toHaveBeenCalledWith(
            expect.anything(),
            kind,
            expect.anything(),
            true
          );
        });
      }
    );
  });

  describe('can  discover tests', () => {
    describe('when no test item is requested', () => {
      it('will resolve the whole workspace via workspaceRoot', () => {
        new JestTestProvider(resultContextMock, debugTestsMock);
        controllerMock.resolveHandler();
        expect(controllerMock.createTestRun).toBeCalled();
        expect(workspaceRootMock.discoverTest).toBeCalledTimes(1);
        expect(workspaceRootMock.discoverTest).toBeCalledWith(controllerMock.lastRunMock());
      });
    });
    describe('when some item is requested', () => {
      it('will forward the request to the item', () => {
        new JestTestProvider(resultContextMock, debugTestsMock);
        const data = setupTestItemData('whatever', true, workspaceRootMock.context);
        controllerMock.resolveHandler(data.item);
        expect(controllerMock.createTestRun).toBeCalled();
        expect(data.discoverTest).toBeCalledWith(controllerMock.lastRunMock());
        expect(controllerMock.lastRunMock().name).toEqual(controllerMock.id);
      });
      it('if item not found in the item-data map should not crash', () => {
        new JestTestProvider(resultContextMock, debugTestsMock);
        const data = makeItemData(true);
        controllerMock.resolveHandler({});
        expect(controllerMock.createTestRun).toBeCalled();
        expect(data.discoverTest).not.toBeCalled();
        expect(workspaceRootMock.discoverTest).not.toBeCalled();
        expect(controllerMock.lastRunMock().name).toEqual(controllerMock.id);
      });
    });
    describe('if discover failed', () => {
      it('error will be reported', () => {
        new JestTestProvider(resultContextMock, debugTestsMock);
        workspaceRootMock.discoverTest.mockImplementation(() => {
          throw new Error('forced crash');
        });
        controllerMock.resolveHandler();
        expect(workspaceRootMock.item.error).toEqual(expect.stringContaining('discoverTest error'));
      });
    });
  });
  describe('upon dispose', () => {
    it('vscode.TestController will be disposed', () => {
      const testProvider = new JestTestProvider(resultContextMock, debugTestsMock);
      testProvider.dispose();
      expect(controllerMock.dispose).toBeCalled();
      expect(workspaceRootMock.dispose).toBeCalled();
    });
  });
  describe('can handle run and debug request', () => {
    let cancelToken;
    const setupItemData = (context) => {
      const itemDataList = [1, 2, 3].map((n) => setupTestItemData(`item-${n}`, true, context));
      itemDataList.forEach((d) => {
        d.context = { workspace: { name: 'whatever' } };
        d.getDebugInfo = jest.fn().mockReturnValueOnce({});
        d.canRun = jest.fn().mockReturnValue(true);
      });
      return itemDataList;
    };
    beforeEach(() => {
      cancelToken = { onCancellationRequested: jest.fn() };
    });
    describe('when debug tests, invoke JestExt debug function', () => {
      let debugDone;
      const finishDebug = async () => {
        debugDone();
        // flush system promise job queue
        await Promise.resolve();
      };
      const controlled = () =>
        new Promise<void>((resolve) => {
          debugDone = () => resolve();
        });

      it('debug tests are done in serial', async () => {
        expect.hasAssertions();

        debugTestsMock.mockImplementation(controlled);

        const testProvider = new JestTestProvider(resultContextMock, debugTestsMock);
        const itemDataList = setupItemData(workspaceRootMock.context);
        const request: any = {
          include: itemDataList.map((d) => d.item),
          profile: { kind: vscode.TestRunProfileKind.Debug },
        };

        const p = testProvider.runTests(request, cancelToken);

        // a run is created
        expect(controllerMock.createTestRun).toBeCalled();

        // verify seerial execution
        expect(debugTestsMock).toBeCalledTimes(1);

        await finishDebug();
        expect(debugTestsMock).toBeCalledTimes(2);

        await finishDebug();
        expect(debugTestsMock).toBeCalledTimes(3);

        await finishDebug();
        await p;
        expect(debugTestsMock).toBeCalledTimes(3);

        // the run will be closed
        expect(controllerMock.lastRunMock().end).toBeCalled();
      });
      it('cancellation means skip the rest of tests', async () => {
        expect.hasAssertions();

        debugTestsMock.mockImplementation(controlled);

        const testProvider = new JestTestProvider(resultContextMock, debugTestsMock);
        const itemDataList = setupItemData(workspaceRootMock.context);
        const request: any = {
          include: itemDataList.map((d) => d.item),
          profile: { kind: vscode.TestRunProfileKind.Debug },
        };

        const p = testProvider.runTests(request, cancelToken);
        const cancelCallback = cancelToken.onCancellationRequested.mock.calls[0][0];
        expect(cancelCallback).not.toBeUndefined();

        // a run is created
        expect(controllerMock.createTestRun).toBeCalled();
        expect(debugTestsMock).toBeCalledTimes(1);

        const runMock = controllerMock.lastRunMock();
        await finishDebug();
        expect(debugTestsMock).toBeCalledTimes(2);

        // cancel the run during 2nd debug, the 3rd one should be skipped
        cancelToken.isCancellationRequested = true;
        cancelCallback();
        expect(runMock.end).toBeCalledTimes(1);

        await finishDebug();
        expect(debugTestsMock).toBeCalledTimes(2);
        await p;

        expect(debugTestsMock).toBeCalledTimes(2);
        expect(runMock.skipped).toBeCalledWith(request.include[2]);

        // the run will be closed
        expect(runMock.end).toBeCalled();
      });
      it('can handle exception', async () => {
        expect.hasAssertions();

        debugTestsMock
          .mockImplementationOnce(() => Promise.resolve())
          .mockImplementationOnce(() => Promise.reject())
          .mockImplementationOnce(throwError);

        const testProvider = new JestTestProvider(resultContextMock, debugTestsMock);
        const itemDataList = setupItemData(workspaceRootMock.context);
        const request: any = {
          include: itemDataList.map((d) => d.item),
          profile: { kind: vscode.TestRunProfileKind.Debug },
        };

        await testProvider.runTests(request, cancelToken);
        const runMock = controllerMock.lastRunMock();

        expect(debugTestsMock).toBeCalledTimes(3);
        expect(runMock.errored).toBeCalledTimes(2);
        expect(runMock.errored).toBeCalledWith(request.include[1], expect.anything());
        expect(runMock.errored).toBeCalledWith(request.include[2], expect.anything());
        expect(runMock.end).toBeCalled();
      });
    });
    describe('when run tests , invoke itemData scheduleTests function', () => {
      it('running tests in parallel', async () => {
        expect.hasAssertions();

        const testProvider = new JestTestProvider(resultContextMock, debugTestsMock);
        const itemDataList = setupItemData(workspaceRootMock.context);
        itemDataList.forEach((d, idx) => d.scheduleTest.mockReturnValueOnce(`pid-${idx}`));

        const request: any = {
          include: itemDataList.map((d) => d.item),
          profile: { kind: vscode.TestRunProfileKind.Run },
        };

        const context = (WorkspaceRoot as jest.Mocked<any>).mock.calls[0][0];
        const p = testProvider.runTests(request, cancelToken);

        // a run is created
        expect(controllerMock.createTestRun).toBeCalled();
        const runMock = controllerMock.lastRunMock();

        itemDataList.forEach((d, idx) => {
          expect(d.scheduleTest).toBeCalled();
          const scheduled = context.getScheduledTest(`pid-${idx}`);
          expect(scheduled.run).not.toBeUndefined();
          expect(scheduled.cancelToken).toBe(cancelToken);
          scheduled.onDone();
        });

        await p;
        expect(runMock.end).toBeCalled();
      });
      it('cancellation is passed to the itemData to handle', async () => {
        expect.hasAssertions();

        const testProvider = new JestTestProvider(resultContextMock, debugTestsMock);
        const itemDataList = setupItemData(workspaceRootMock.context);
        itemDataList.forEach((d, idx) => d.scheduleTest.mockReturnValueOnce(`pid-${idx}`));

        const request: any = {
          include: itemDataList.map((d) => d.item),
          profile: { kind: vscode.TestRunProfileKind.Run },
        };
        const context = (WorkspaceRoot as jest.Mocked<any>).mock.calls[0][0];

        const p = testProvider.runTests(request, cancelToken);
        const cancelCallback = cancelToken.onCancellationRequested.mock.calls[0][0];
        expect(cancelCallback).not.toBeUndefined();

        const runMock = controllerMock.lastRunMock();
        // cacnel after run
        cancelToken.isCancellationRequested = true;
        cancelCallback();
        expect(runMock.end).toBeCalledTimes(1);

        // a run is already created
        expect(controllerMock.createTestRun).toBeCalled();

        itemDataList.forEach((d, idx) => {
          expect(d.scheduleTest).toBeCalled();
          const scheduled = context.getScheduledTest(`pid-${idx}`);
          expect(scheduled.run).not.toBeUndefined();
          expect(scheduled.cancelToken.isCancellationRequested).toBe(true);
          // this is still need to be called, otherwise the runTest will hang
          scheduled.onDone();
        });

        await p;
        expect(runMock.end).toBeCalledTimes(2);
      });
      it('can handle exception', async () => {
        expect.hasAssertions();

        const testProvider = new JestTestProvider(resultContextMock, debugTestsMock);
        const itemDataList = setupItemData(workspaceRootMock.context);
        itemDataList.forEach((d, idx) => {
          if (idx === 1) {
            d.scheduleTest.mockImplementation(() => {
              throw new Error('error scheduling test');
            });
          } else {
            d.scheduleTest.mockReturnValueOnce(`pid-${idx}`);
          }
        });
        const request: any = {
          include: itemDataList.map((d) => d.item),
          profile: { kind: vscode.TestRunProfileKind.Run },
        };
        const context = (WorkspaceRoot as jest.Mocked<any>).mock.calls[0][0];

        const p = testProvider.runTests(request, cancelToken);

        // cacnel after run
        cancelToken.isCancellationRequested = true;

        // a run is already created
        expect(controllerMock.createTestRun).toBeCalled();
        const runMock = controllerMock.lastRunMock();

        itemDataList.forEach((d, idx) => {
          expect(d.scheduleTest).toBeCalled();
          const scheduled = context.getScheduledTest(`pid-${idx}`);

          /* eslint-disable jest/no-conditional-expect */
          if (idx === 1) {
            expect(scheduled).toBeUndefined();
          } else {
            expect(scheduled.run).not.toBeUndefined();
            expect(scheduled.cancelToken.isCancellationRequested).toBe(true);
            scheduled.onDone();
          }
        });

        await p;
        expect(runMock.end).toBeCalled();
      });
      it('if no item in request, will run test for the whole workplace', async () => {
        expect.hasAssertions();

        const testProvider = new JestTestProvider(resultContextMock, debugTestsMock);
        workspaceRootMock.scheduleTest = jest.fn().mockReturnValue('pid');

        const request: any = {
          profile: { kind: vscode.TestRunProfileKind.Run },
        };

        const p = testProvider.runTests(request, cancelToken);
        const runMock = controllerMock.lastRunMock();
        expect(workspaceRootMock.scheduleTest).toBeCalledTimes(1);
        const scheduled = workspaceRootMock.context.getScheduledTest('pid');
        expect(scheduled.run).not.toBeUndefined();
        scheduled.onDone();

        await p;
        expect(runMock.end).toBeCalled();
      });
      it('will reject run request without profile', async () => {
        expect.hasAssertions();

        const testProvider = new JestTestProvider(resultContextMock, debugTestsMock);
        const request: any = {};

        await expect(testProvider.runTests(request, cancelToken)).rejects.not.toThrow();
        expect(workspaceRootMock.scheduleTest).toBeCalledTimes(0);
        expect(controllerMock.createTestRun).not.toBeCalled();
      });
    });
    it('will report error for testItems not supporting the given runProfile', async () => {
      expect.hasAssertions();

      const testProvider = new JestTestProvider(resultContextMock, debugTestsMock);
      const itemDataList = setupItemData(workspaceRootMock.context);
      itemDataList.forEach((d, idx) => {
        d.scheduleTest.mockReturnValueOnce(`pid-${idx}`);
        if (idx === 1) {
          d.canRun.mockReturnValue(false);
        }
      });
      const request: any = {
        include: itemDataList.map((d) => d.item),
        profile: { kind: vscode.TestRunProfileKind.Run },
      };

      const context = (WorkspaceRoot as jest.Mocked<any>).mock.calls[0][0];
      const p = testProvider.runTests(request, cancelToken);

      expect(controllerMock.createTestRun).toBeCalled();
      const runMock = controllerMock.lastRunMock();

      itemDataList.forEach((d, idx) => {
        if (idx !== 1) {
          expect(d.scheduleTest).toBeCalled();

          const scheduled = context.getScheduledTest(`pid-${idx}`);
          expect(scheduled.run).not.toBeUndefined();
          expect(scheduled.cancelToken).toBe(cancelToken);
          scheduled.onDone();
        } else {
          expect(d.scheduleTest).not.toBeCalled();
        }
      });

      await p;
      expect(runMock.end).toBeCalled();
      expect(vscode.window.showWarningMessage).toBeCalled();
    });
  });
});
