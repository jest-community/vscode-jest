jest.unmock('../../src/test-provider/test-provider');
jest.unmock('../../src/test-provider/test-provider-context');
jest.unmock('./test-helper');
jest.unmock('../../src/appGlobals');

import * as vscode from 'vscode';
import { JestTestProvider } from '../../src/test-provider/test-provider';
import { WorkspaceRoot } from '../../src/test-provider/test-item-data';
import { JestTestProviderContext } from '../../src/test-provider/test-provider-context';
import { extensionId } from '../../src/appGlobals';
import { mockController, mockExtExplorerContext } from './test-helper';

const throwError = () => {
  throw new Error('debug error');
};

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
  let extExplorerContextMock;
  let workspaceRootMock;

  beforeEach(() => {
    jest.resetAllMocks();

    extExplorerContextMock = mockExtExplorerContext();

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
      workspaceRootMock.context = context;
      return workspaceRootMock;
    });
  });

  describe('upon creation', () => {
    it('will setup controller and WorkspaceRoot', () => {
      new JestTestProvider(extExplorerContextMock);

      expect(controllerMock.resolveHandler).not.toBeUndefined();
      expect(vscode.tests.createTestController).toHaveBeenCalledWith(
        `${extensionId}:TestProvider:ws-1`,
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
        extExplorerContextMock.autoRun.isWatch = isWatchMode;
        new JestTestProvider(extExplorerContextMock);
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
    it('should only discover items with canResolveChildren = true', () => {
      new JestTestProvider(extExplorerContextMock);
      const data = setupTestItemData('whatever', true, workspaceRootMock.context);
      data.item.canResolveChildren = true;
      controllerMock.resolveHandler(data.item);
      expect(controllerMock.createTestRun).toBeCalled();
      controllerMock.createTestRun.mockClear();

      data.item.canResolveChildren = false;
      controllerMock.resolveHandler(data.item);
      expect(controllerMock.createTestRun).not.toBeCalled();
    });
    describe('when no test item is requested', () => {
      it('will resolve the whole workspace via workspaceRoot', () => {
        new JestTestProvider(extExplorerContextMock);
        workspaceRootMock.item.canResolveChildren = true;
        controllerMock.resolveHandler();
        expect(controllerMock.createTestRun).toBeCalled();
        expect(workspaceRootMock.discoverTest).toBeCalledTimes(1);
        expect(workspaceRootMock.discoverTest).toBeCalledWith(controllerMock.lastRunMock());
        // run will be created with the controller's id
        expect(controllerMock.lastRunMock().name).toEqual(
          expect.stringContaining(controllerMock.id)
        );
        // run will be closed
        expect(controllerMock.lastRunMock().end).toBeCalled();
      });
    });
    describe('when specific item is requested', () => {
      it('will forward the request to the item', () => {
        new JestTestProvider(extExplorerContextMock);
        const data = setupTestItemData('whatever', true, workspaceRootMock.context);
        data.item.canResolveChildren = true;
        controllerMock.resolveHandler(data.item);
        expect(controllerMock.createTestRun).toBeCalled();
        expect(data.discoverTest).toBeCalledWith(controllerMock.lastRunMock());
        // run will be created with the controller's id
        expect(controllerMock.lastRunMock().name).toEqual(
          expect.stringContaining(controllerMock.id)
        );
        // run will be closed
        expect(controllerMock.lastRunMock().end).toBeCalled();
      });
      it('should not crash if item not found in the item-data map', () => {
        new JestTestProvider(extExplorerContextMock);
        const data = makeItemData(true);
        controllerMock.resolveHandler({ canResolveChildren: true });
        expect(controllerMock.createTestRun).toBeCalled();
        expect(data.discoverTest).not.toBeCalled();
        expect(workspaceRootMock.discoverTest).not.toBeCalled();
        // run will be created with the controller's id
        expect(controllerMock.lastRunMock().name).toEqual(
          expect.stringContaining(controllerMock.id)
        );
        // run will be closed
        expect(controllerMock.lastRunMock().end).toBeCalled();
      });
    });
    describe('if discover failed', () => {
      it('error will be reported', () => {
        new JestTestProvider(extExplorerContextMock);
        workspaceRootMock.discoverTest.mockImplementation(() => {
          throw new Error('forced crash');
        });
        workspaceRootMock.item.canResolveChildren = true;
        controllerMock.resolveHandler();
        expect(workspaceRootMock.item.error).toEqual(expect.stringContaining('discoverTest error'));

        // run will be created with the controller's id
        expect(controllerMock.lastRunMock().name).toEqual(
          expect.stringContaining(controllerMock.id)
        );
        // run will be closed
        expect(controllerMock.lastRunMock().end).toBeCalled();
      });
    });
  });
  describe('upon dispose', () => {
    it('vscode.TestController will be disposed', () => {
      const testProvider = new JestTestProvider(extExplorerContextMock);
      testProvider.dispose();
      expect(controllerMock.dispose).toBeCalled();
      expect(workspaceRootMock.dispose).toBeCalled();
    });
  });
  describe('supports explorer UI run and debug request', () => {
    let cancelToken;
    const setupItemData = (context, items = [1, 2, 3]) => {
      const itemDataList = items.map((n) => setupTestItemData(`item-${n}`, true, context));
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
    describe('debug tests', () => {
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
      it.each`
        debugInfo                                          | debugTests                       | hasError
        ${undefined}                                       | ${() => Promise.resolve()}       | ${true}
        ${{ fileName: 'file', testNamePattern: 'a test' }} | ${() => Promise.resolve()}       | ${false}
        ${{ fileName: 'file', testNamePattern: 'a test' }} | ${() => Promise.reject('error')} | ${true}
        ${{ fileName: 'file', testNamePattern: 'a test' }} | ${throwError}                    | ${true}
      `(
        "invoke debug test async:  debugInfo = '$debugInfo' when resultContextMock.debugTests = $resultContextMock.debugTests => error? $hasError",
        async ({ debugInfo, debugTests, hasError }) => {
          expect.hasAssertions();
          extExplorerContextMock.debugTests = jest.fn(() => {
            if (debugTests) {
              return debugTests();
            }
          });
          const testProvider = new JestTestProvider(extExplorerContextMock);

          const itemDataList = setupItemData(workspaceRootMock.context, [1]);
          itemDataList.forEach((d) => {
            d.canRun.mockReturnValue(true);
            if (debugInfo) {
              d.getDebugInfo.mockReturnValueOnce(debugInfo);
            } else {
              d.getDebugInfo = undefined;
            }
          });
          const request: any = {
            include: itemDataList.map((d) => d.item),
            profile: { kind: vscode.TestRunProfileKind.Debug },
          };

          await expect(testProvider.runTests(request, cancelToken)).resolves.toBe(undefined);

          if (hasError) {
            expect(controllerMock.lastRunMock().errored).toBeCalledWith(
              itemDataList[0].item,
              expect.anything()
            );
            expect(vscode.TestMessage).toBeCalledTimes(1);
          }
        }
      );
      it('debug tests are done in serial', async () => {
        expect.hasAssertions();

        extExplorerContextMock.debugTests.mockImplementation(controlled);

        const testProvider = new JestTestProvider(extExplorerContextMock);
        const itemDataList = setupItemData(workspaceRootMock.context);
        const request: any = {
          include: itemDataList.map((d) => d.item),
          profile: { kind: vscode.TestRunProfileKind.Debug },
        };

        const p = testProvider.runTests(request, cancelToken);

        // a run is created
        expect(controllerMock.createTestRun).toBeCalled();

        // verify seerial execution
        expect(extExplorerContextMock.debugTests).toBeCalledTimes(1);

        await finishDebug();
        expect(extExplorerContextMock.debugTests).toBeCalledTimes(2);

        await finishDebug();
        expect(extExplorerContextMock.debugTests).toBeCalledTimes(3);

        await finishDebug();
        await p;
        expect(extExplorerContextMock.debugTests).toBeCalledTimes(3);

        // the run will be closed
        expect(controllerMock.lastRunMock().end).toBeCalled();
      });
      it('cancellation means skip the rest of tests', async () => {
        expect.hasAssertions();

        extExplorerContextMock.debugTests.mockImplementation(controlled);

        const testProvider = new JestTestProvider(extExplorerContextMock);
        const itemDataList = setupItemData(workspaceRootMock.context);
        const request: any = {
          include: itemDataList.map((d) => d.item),
          profile: { kind: vscode.TestRunProfileKind.Debug },
        };

        const p = testProvider.runTests(request, cancelToken);

        // a run is created
        expect(controllerMock.createTestRun).toBeCalled();
        expect(extExplorerContextMock.debugTests).toBeCalledTimes(1);

        const runMock = controllerMock.lastRunMock();
        await finishDebug();
        expect(extExplorerContextMock.debugTests).toBeCalledTimes(2);

        // cancel the run during 2nd debug, the 3rd one should be skipped
        cancelToken.isCancellationRequested = true;

        await finishDebug();
        expect(extExplorerContextMock.debugTests).toBeCalledTimes(2);
        await p;

        expect(extExplorerContextMock.debugTests).toBeCalledTimes(2);
        expect(runMock.skipped).toBeCalledWith(request.include[2]);

        // the run will be closed
        expect(runMock.end).toBeCalledTimes(1);
      });
      it('can handle exception', async () => {
        expect.hasAssertions();

        extExplorerContextMock.debugTests
          .mockImplementationOnce(() => Promise.resolve())
          .mockImplementationOnce(() => Promise.reject())
          .mockImplementationOnce(throwError);

        const testProvider = new JestTestProvider(extExplorerContextMock);
        const itemDataList = setupItemData(workspaceRootMock.context);
        const request: any = {
          include: itemDataList.map((d) => d.item),
          profile: { kind: vscode.TestRunProfileKind.Debug },
        };

        await testProvider.runTests(request, cancelToken);
        const runMock = controllerMock.lastRunMock();

        expect(extExplorerContextMock.debugTests).toBeCalledTimes(3);
        expect(runMock.errored).toBeCalledTimes(2);
        expect(runMock.errored).toBeCalledWith(request.include[1], expect.anything());
        expect(runMock.errored).toBeCalledWith(request.include[2], expect.anything());
        expect(runMock.end).toBeCalled();
      });
    });
    describe('run tests', () => {
      const resolveSchedule = (_r, resolve) => {
        resolve();
      };
      it.each`
        scheduleTest       | isCancelled | state
        ${resolveSchedule} | ${false}    | ${undefined}
        ${resolveSchedule} | ${true}     | ${'skipped'}
        ${throwError}      | ${false}    | ${'errored'}
      `(
        'run test should always resolve: schedule test pid = $pid, isCancelled=$isCancelled => state? $state',
        async ({ scheduleTest, isCancelled, state }) => {
          expect.hasAssertions();

          const testProvider = new JestTestProvider(extExplorerContextMock);
          const itemDataList = setupItemData(workspaceRootMock.context, [1]);
          itemDataList.forEach((d) => d.scheduleTest.mockImplementation(scheduleTest));
          const tData = itemDataList[0];

          const request: any = {
            include: itemDataList.map((d) => d.item),
            profile: { kind: vscode.TestRunProfileKind.Run },
          };

          cancelToken.isCancellationRequested = isCancelled;
          const p = testProvider.runTests(request, cancelToken);

          const runMock = controllerMock.lastRunMock();

          if (isCancelled) {
            expect(tData.scheduleTest).not.toBeCalled();
          } else {
            expect(tData.scheduleTest).toBeCalled();
          }

          await expect(p).resolves.toBe(undefined);
          expect(runMock.end).toBeCalled();

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
      it('running tests in parallel', async () => {
        expect.hasAssertions();

        const testProvider = new JestTestProvider(extExplorerContextMock);
        const itemDataList = setupItemData(workspaceRootMock.context);
        // itemDataList.forEach((d, idx) => d.scheduleTest.mockReturnValueOnce(`pid-${idx}`));

        const request: any = {
          include: itemDataList.map((d) => d.item),
          profile: { kind: vscode.TestRunProfileKind.Run },
        };

        const p = testProvider.runTests(request, cancelToken);

        // a run is created
        expect(controllerMock.createTestRun).toBeCalled();
        const runMock = controllerMock.lastRunMock();

        itemDataList.forEach((d) => {
          expect(d.scheduleTest).toBeCalled();
          const [run, resolve, profile] = d.scheduleTest.mock.calls[0];
          expect(run).toBe(runMock);
          expect(profile).toBe(request.profile);
          // close the schedule
          resolve();
        });

        await p;
        expect(runMock.end).toBeCalled();
      });
      it('cancellation is passed to the itemData to handle', async () => {
        expect.hasAssertions();

        const testProvider = new JestTestProvider(extExplorerContextMock);
        const itemDataList = setupItemData(workspaceRootMock.context);
        itemDataList.forEach((d, idx) => d.scheduleTest.mockReturnValueOnce(`pid-${idx}`));

        const request: any = {
          include: itemDataList.map((d) => d.item),
          profile: { kind: vscode.TestRunProfileKind.Run },
        };
        const p = testProvider.runTests(request, cancelToken);

        const runMock = controllerMock.lastRunMock();
        // cacnel after run
        cancelToken.isCancellationRequested = true;

        // a run is already created
        expect(controllerMock.createTestRun).toBeCalled();

        itemDataList.forEach((d) => {
          expect(d.scheduleTest).toBeCalled();
          const [run, resolve, profile] = d.scheduleTest.mock.calls[0];
          expect(run).toBe(runMock);
          expect(profile).toBe(request.profile);
          // close the schedule
          resolve();
        });

        await p;
        expect(runMock.end).toBeCalledTimes(1);
      });
      it('can handle exception', async () => {
        expect.hasAssertions();

        const testProvider = new JestTestProvider(extExplorerContextMock);
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
        const p = testProvider.runTests(request, cancelToken);

        // cacnel after run
        cancelToken.isCancellationRequested = true;

        // a run is already created
        expect(controllerMock.createTestRun).toBeCalled();
        const runMock = controllerMock.lastRunMock();

        itemDataList.forEach((d, idx) => {
          expect(d.scheduleTest).toBeCalled();
          const [run, resolve, profile] = d.scheduleTest.mock.calls[0];
          expect(run).toBe(runMock);
          expect(profile).toBe(request.profile);

          /* eslint-disable jest/no-conditional-expect */
          if (idx === 1) {
            expect(run.errored).toBeCalledWith(d.item, expect.anything());
          } else {
            expect(run.errored).not.toBeCalledWith(d.item, expect.anything());
            // close the schedule
            resolve();
          }
        });

        await p;
        expect(runMock.end).toBeCalled();
      });
      it('if no item in request, will run test for the whole workplace', async () => {
        expect.hasAssertions();

        const testProvider = new JestTestProvider(extExplorerContextMock);

        const request: any = {
          profile: { kind: vscode.TestRunProfileKind.Run },
        };

        const p = testProvider.runTests(request, cancelToken);
        const runMock = controllerMock.lastRunMock();
        expect(workspaceRootMock.scheduleTest).toBeCalledTimes(1);
        const [run, resolve, profile] = workspaceRootMock.scheduleTest.mock.calls[0];
        expect(run).toBe(runMock);
        expect(profile).toBe(request.profile);
        resolve();

        await p;
        expect(runMock.end).toBeCalled();
      });
      it('will reject run request without profile', async () => {
        expect.hasAssertions();

        const testProvider = new JestTestProvider(extExplorerContextMock);
        const request: any = {};

        await expect(testProvider.runTests(request, cancelToken)).rejects.not.toThrow();
        expect(workspaceRootMock.scheduleTest).toBeCalledTimes(0);
        expect(controllerMock.createTestRun).not.toBeCalled();
      });
    });
    it('will report error for testItems not supporting the given runProfile', async () => {
      expect.hasAssertions();

      const testProvider = new JestTestProvider(extExplorerContextMock);
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

      const p = testProvider.runTests(request, cancelToken);

      expect(controllerMock.createTestRun).toBeCalled();
      const runMock = controllerMock.lastRunMock();

      itemDataList.forEach((d, idx) => {
        if (idx !== 1) {
          expect(d.scheduleTest).toBeCalled();
          const [run, resolve, profile] = d.scheduleTest.mock.calls[0];
          expect(run).toBe(runMock);
          expect(profile).toBe(request.profile);
          resolve();
        } else {
          expect(d.scheduleTest).not.toBeCalled();
          expect(vscode.window.showWarningMessage).toBeCalled();
        }
      });

      await p;
      expect(runMock.end).toBeCalled();
      expect(vscode.window.showWarningMessage).toBeCalled();
    });
  });
});
