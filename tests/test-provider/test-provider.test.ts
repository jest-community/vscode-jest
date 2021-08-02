jest.unmock('../../src/test-provider/test-provider');
jest.unmock('../../src/appGlobals');

import * as vscode from 'vscode';
import { debugTest, JestTestProvider, runTest } from '../../src/test-provider/test-provider';
import { WorkspaceRoot } from '../../src/test-provider/test-item-data';
import { TestItemStore } from '../../src/test-provider/utils';
import { ScheduledTest } from '../../src/test-provider/types';
import { extensionId } from '../../src/appGlobals';

// const WorkspaceRootMock = WorkspaceRoot as jest.Mocked<any>;

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
      const runMock: any = {
        appendOutput: jest.fn(),
        errored: jest.fn(),
        skipped: jest.fn(),
      };
      const profile: any = { kind: vscode.TestRunProfileKind.Run };

      const scheduledTests: Map<string, ScheduledTest> = new Map();
      const cancelToken: any = { isCancellationRequested: isCancelled };

      const p = runTest(tData, runMock, cancelToken, scheduledTests, profile);
      if (isCancelled) {
        expect(tData.scheduleTest).not.toBeCalled();
      } else {
        expect(tData.scheduleTest).toBeCalled();
        if (typeof pid === 'string') {
          expect(scheduledTests.size).toBe(1);
          const { onDone } = scheduledTests.get(pid);
          expect(onDone).not.toBeUndefined();
          onDone();
        } else {
          expect(scheduledTests.size).toBe(0);
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
  const createResultContext = (wsName = 'ws-1', override: any = {}): any => {
    return {
      autoRun: {},
      session: {},
      workspace: { name: wsName },
      testResolveProvider: jest.fn(),
      ...override,
    };
  };

  const makeItemData = (item: any, debuggable = true) => {
    const data: any = {
      discoverTest: jest.fn(),
      scheduleTest: jest.fn(),
      item,
      dispose: jest.fn(),
      canRun: jest.fn().mockReturnValue(true),
    };
    if (debuggable) {
      data.getDebugInfo = jest.fn();
    }
    return data;
  };

  const setupTestItemData = (id: string, debuggable = true, updateMap = true): any => {
    const item = { id };
    const data = makeItemData(item, debuggable);
    if (updateMap) {
      itemStoreMock.map.set(item, data);
    }
    return data;
  };

  let controllerMock;
  let runMock;
  let itemStoreMock;
  let resultContextMock;
  let debugTestsMock;
  let workspaceRootMock;

  beforeEach(() => {
    jest.resetAllMocks();

    resultContextMock = createResultContext();
    debugTestsMock = jest.fn();

    runMock = {
      errored: jest.fn(),
      skipped: jest.fn(),
      appendOutput: jest.fn(),
      end: jest.fn(),
    };
    controllerMock = {
      createTestRun: jest.fn().mockImplementation((request, name) => {
        runMock.name = name;
        runMock.request = request;
        return runMock;
      }),
      dispose: jest.fn(),
      createRunProfile: jest.fn(),
      items: jest.fn(),
    };
    (vscode.tests.createTestController as jest.Mocked<any>).mockImplementation((id, label) => {
      controllerMock.id = id;
      controllerMock.label = label;
      return controllerMock;
    });

    const map = new Map<object, object>();
    itemStoreMock = {
      map,
      getData: jest.fn().mockImplementation((item) => map.get(item)),
    };
    (TestItemStore as jest.Mocked<any>).mockImplementation(() => itemStoreMock);
    (vscode.workspace.getWorkspaceFolder as jest.Mocked<any>).mockImplementation((uri) => ({
      name: uri,
    }));

    workspaceRootMock = setupTestItemData('workspace-root', false, true);
    workspaceRootMock.activate = jest.fn();
    (WorkspaceRoot as jest.Mocked<any>).mockReturnValue(workspaceRootMock);
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
  });
  // describe('upon ativation', () => {
  //   it('will activate workspaceRoot', () => {
  //     const mockActivate = jest.fn();
  //     (WorkspaceRoot as jest.Mocked<any>).mockImplementation(() => {
  //       return { activate: mockActivate };
  //     });
  //     const testProvider = new JestTestProvider(resultContextMock, debugTestsMock);
  //     expect(mockActivate).not.toBeCalled();
  //     testProvider.activate();
  //     expect(mockActivate).toBeCalled();
  //   });
  // });
  describe('can  discover tests', () => {
    describe('when no test item is requested', () => {
      it('will resolve the whole workspace via workspaceRoot', () => {
        new JestTestProvider(resultContextMock, debugTestsMock);
        controllerMock.resolveHandler();
        expect(controllerMock.createTestRun).toBeCalled();
        expect(workspaceRootMock.discoverTest).toBeCalledTimes(1);
        expect(workspaceRootMock.discoverTest).toBeCalledWith(runMock);
      });
    });
    describe('when some item is requested', () => {
      it('will forward the request to the item', () => {
        const data = setupTestItemData('whatever', true, true);
        new JestTestProvider(resultContextMock, debugTestsMock);
        controllerMock.resolveHandler(data.item);
        expect(controllerMock.createTestRun).toBeCalled();
        expect(data.discoverTest).toBeCalledWith(runMock);
        expect(runMock.name).toEqual(controllerMock.id);
      });
      it('if item not found in the item-data map should not crash', () => {
        const data = setupTestItemData('whatever', true, false);
        new JestTestProvider(resultContextMock, debugTestsMock);
        controllerMock.resolveHandler({});
        expect(controllerMock.createTestRun).toBeCalled();
        expect(data.discoverTest).not.toBeCalled();
        expect(workspaceRootMock.discoverTest).not.toBeCalled();
        expect(runMock.name).toEqual(controllerMock.id);
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
    let itemDataList, cancelToken;
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
      beforeEach(() => {
        itemDataList = [1, 2, 3].map((n) => setupTestItemData(`item-${n}`, true, true));
        itemDataList.forEach((d) => {
          d.context = { workspace: { name: 'whatever' } };
          d.getDebugInfo = jest.fn().mockReturnValueOnce({});
          d.canRun = jest.fn().mockReturnValue(true);
        });
      });
      it('debug tests are done in serial', async () => {
        expect.hasAssertions();

        debugTestsMock.mockImplementation(controlled);

        const testProvider = new JestTestProvider(resultContextMock, debugTestsMock);
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
        expect(runMock.end).toBeCalled();
      });
      it('cancellation means skip the rest of tests', async () => {
        expect.hasAssertions();

        debugTestsMock.mockImplementation(controlled);

        const testProvider = new JestTestProvider(resultContextMock, debugTestsMock);
        const request: any = {
          include: itemDataList.map((d) => d.item),
          profile: { kind: vscode.TestRunProfileKind.Debug },
        };

        const p = testProvider.runTests(request, cancelToken);
        // a run is created
        expect(controllerMock.createTestRun).toBeCalled();
        expect(debugTestsMock).toBeCalledTimes(1);

        await finishDebug();
        expect(debugTestsMock).toBeCalledTimes(2);

        // cancel the run during 2nd debug, the 3rd one should be skipped
        cancelToken.isCancellationRequested = true;

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
        const request: any = {
          include: itemDataList.map((d) => d.item),
          profile: { kind: vscode.TestRunProfileKind.Debug },
        };

        await testProvider.runTests(request, cancelToken);

        expect(debugTestsMock).toBeCalledTimes(3);
        expect(runMock.errored).toBeCalledTimes(2);
        expect(runMock.errored).toBeCalledWith(request.include[1], expect.anything());
        expect(runMock.errored).toBeCalledWith(request.include[2], expect.anything());
        expect(runMock.end).toBeCalled();
      });
    });
    describe('when run tests , invoke itemData scheduleTests function', () => {
      beforeEach(() => {
        itemDataList = [1, 2, 3].map((n) => setupTestItemData(`item-${n}`, true, true));
      });
      it('running tests in parallel', async () => {
        expect.hasAssertions();
        itemDataList.forEach((d, idx) => d.scheduleTest.mockReturnValueOnce(`pid-${idx}`));

        const testProvider = new JestTestProvider(resultContextMock, debugTestsMock);
        const request: any = {
          include: itemDataList.map((d) => d.item),
          profile: { kind: vscode.TestRunProfileKind.Run },
        };

        const context = (WorkspaceRoot as jest.Mocked<any>).mock.calls[0][0];
        const p = testProvider.runTests(request, cancelToken);

        // a run is created
        expect(controllerMock.createTestRun).toBeCalled();

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
        itemDataList.forEach((d, idx) => d.scheduleTest.mockReturnValueOnce(`pid-${idx}`));

        const testProvider = new JestTestProvider(resultContextMock, debugTestsMock);
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

        itemDataList.forEach((d, idx) => {
          expect(d.scheduleTest).toBeCalled();
          const scheduled = context.getScheduledTest(`pid-${idx}`);
          expect(scheduled.run).not.toBeUndefined();
          expect(scheduled.cancelToken.isCancellationRequested).toBe(true);
          // this is still need to be called, otherwise the runTest will hang
          scheduled.onDone();
        });

        await p;
        expect(runMock.end).toBeCalled();
      });
      it('can handle exception', async () => {
        expect.hasAssertions();
        itemDataList.forEach((d, idx) => {
          if (idx === 1) {
            d.scheduleTest.mockImplementation(() => {
              throw new Error('error scheduling test');
            });
          } else {
            d.scheduleTest.mockReturnValueOnce(`pid-${idx}`);
          }
        });

        const testProvider = new JestTestProvider(resultContextMock, debugTestsMock);
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
    });
    it('will report error for testItems not supporting the given runProfile', async () => {
      expect.hasAssertions();
      itemDataList = [0, 1, 2].map((n) => {
        const data = setupTestItemData(`item-${n}`, false, true);
        data.scheduleTest.mockReturnValueOnce(`pid-${n}`);
        if (n === 1) {
          data.canRun.mockReturnValue(false);
        }
        return data;
      });

      const testProvider = new JestTestProvider(resultContextMock, debugTestsMock);
      const request: any = {
        include: itemDataList.map((d) => d.item),
        profile: { kind: vscode.TestRunProfileKind.Run },
      };

      const context = (WorkspaceRoot as jest.Mocked<any>).mock.calls[0][0];
      const p = testProvider.runTests(request, cancelToken);

      expect(controllerMock.createTestRun).toBeCalled();

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