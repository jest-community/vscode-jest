jest.unmock('../../src/test-provider/test-provider');
jest.unmock('../../src/test-provider/test-provider-helper');
jest.unmock('./test-helper');
jest.unmock('../../src/appGlobals');

import * as vscode from 'vscode';
import { JestTestProvider } from '../../src/test-provider/test-provider';
import { WorkspaceRoot } from '../../src/test-provider/test-item-data';
import { JestTestProviderContext } from '../../src/test-provider/test-provider-helper';
import { extensionId } from '../../src/appGlobals';
import { mockController, mockExtExplorerContext } from './test-helper';
import { tiContextManager } from '../../src/test-provider/test-item-context-manager';
import { ItemCommand } from '../../src/test-provider/types';

const throwError = () => {
  throw new Error('debug error');
};

describe('JestTestProvider', () => {
  const makeItemData = (debuggable = true) => {
    const data: any = {
      discoverTest: jest.fn(),
      scheduleTest: jest.fn(),
      runItemCommand: jest.fn(),
      dispose: jest.fn(),
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
  let mockTestTag;

  beforeEach(() => {
    jest.resetAllMocks();

    extExplorerContextMock = mockExtExplorerContext();

    controllerMock = mockController();
    (vscode.tests.createTestController as jest.Mocked<any>).mockImplementation((id, label) => {
      controllerMock.id = id;
      controllerMock.label = label;
      return controllerMock;
    });

    mockTestTag = jest.fn((id) => ({ id }));
    (vscode.TestTag as jest.Mocked<any>) = mockTestTag;

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
      expect(controllerMock.createRunProfile).toHaveBeenCalledTimes(2);
      [
        [vscode.TestRunProfileKind.Run, 'run', true],
        [vscode.TestRunProfileKind.Debug, 'debug', true],
      ].forEach(([kind, id, isDefault]) => {
        expect(controllerMock.createRunProfile).toHaveBeenCalledWith(
          expect.anything(),
          kind,
          expect.anything(),
          isDefault,
          expect.objectContaining({ id })
        );
      });

      expect(WorkspaceRoot).toHaveBeenCalled();
    });
  });

  describe('can discover tests', () => {
    it('should only discover items with canResolveChildren = true', () => {
      new JestTestProvider(extExplorerContextMock);
      const data = setupTestItemData('whatever', true, workspaceRootMock.context);
      data.item.canResolveChildren = true;
      controllerMock.resolveHandler(data.item);
      expect(controllerMock.createTestRun).toHaveBeenCalled();
      controllerMock.createTestRun.mockClear();

      data.item.canResolveChildren = false;
      controllerMock.resolveHandler(data.item);
      expect(controllerMock.createTestRun).not.toHaveBeenCalled();
    });
    describe('when no test item is requested', () => {
      it('will resolve the whole workspace via workspaceRoot', () => {
        new JestTestProvider(extExplorerContextMock);
        workspaceRootMock.item.canResolveChildren = true;
        controllerMock.resolveHandler();
        expect(controllerMock.createTestRun).toHaveBeenCalled();
        expect(workspaceRootMock.discoverTest).toHaveBeenCalledTimes(1);

        // run will be created with the controller's id
        expect(controllerMock.lastRunMock().name).toEqual(
          expect.stringContaining(controllerMock.id)
        );
        // run will be closed
        expect(controllerMock.lastRunMock().end).toHaveBeenCalled();
      });
    });
    describe('when specific item is requested', () => {
      it('will forward the request to the item', () => {
        new JestTestProvider(extExplorerContextMock);
        const data = setupTestItemData('whatever', true, workspaceRootMock.context);
        data.item.canResolveChildren = true;
        controllerMock.resolveHandler(data.item);
        expect(controllerMock.createTestRun).toHaveBeenCalled();

        // run will be created with the controller's id
        expect(controllerMock.lastRunMock().name).toEqual(
          expect.stringContaining(controllerMock.id)
        );
        // run will be closed
        expect(controllerMock.lastRunMock().end).toHaveBeenCalled();
      });
      it('should not crash if item not found in the item-data map', () => {
        new JestTestProvider(extExplorerContextMock);
        const data = makeItemData(true);
        controllerMock.resolveHandler({ canResolveChildren: true });
        expect(controllerMock.createTestRun).toHaveBeenCalled();
        expect(data.discoverTest).not.toHaveBeenCalled();
        expect(workspaceRootMock.discoverTest).not.toHaveBeenCalled();
        // run will be created with the controller's id
        expect(controllerMock.lastRunMock().name).toEqual(
          expect.stringContaining(controllerMock.id)
        );
        // run will be closed
        expect(controllerMock.lastRunMock().end).toHaveBeenCalled();
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
        expect(controllerMock.lastRunMock().end).toHaveBeenCalled();
      });
    });
  });
  describe('upon dispose', () => {
    it('vscode.TestController will be disposed', () => {
      const testProvider = new JestTestProvider(extExplorerContextMock);
      testProvider.dispose();
      expect(controllerMock.dispose).toHaveBeenCalled();
      expect(workspaceRootMock.dispose).toHaveBeenCalled();
    });
  });
  describe('supports explorer UI run and debug request', () => {
    let cancelToken;
    const setupItemData = (context, items = [1, 2, 3]) => {
      const itemDataList = items.map((n) => setupTestItemData(`item-${n}`, true, context));
      itemDataList.forEach((d) => {
        d.context = { workspace: { name: 'whatever' } };
        d.getDebugInfo = jest.fn().mockReturnValueOnce({});
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
        case | debugInfo               | testNamePattern | debugTests                       | hasError
        ${1} | ${undefined}            | ${undefined}    | ${() => Promise.resolve()}       | ${true}
        ${2} | ${{ fileName: 'file' }} | ${'a test'}     | ${() => Promise.resolve()}       | ${false}
        ${3} | ${{ fileName: 'file' }} | ${'a test'}     | ${() => Promise.reject('error')} | ${true}
        ${4} | ${{ fileName: 'file' }} | ${'a test'}     | ${throwError}                    | ${true}
        ${5} | ${{ fileName: 'file' }} | ${undefined}    | ${() => Promise.resolve()}       | ${false}
      `(
        'invoke debug test async case $case => error? $hasError',
        async ({ debugInfo, testNamePattern, debugTests, hasError }) => {
          expect.hasAssertions();
          extExplorerContextMock.debugTests = jest.fn().mockImplementation(() => {
            if (debugTests) {
              return debugTests();
            }
          });
          const testProvider = new JestTestProvider(extExplorerContextMock);

          const itemDataList = setupItemData(workspaceRootMock.context, [1]);
          itemDataList.forEach((d) => {
            if (debugInfo) {
              d.getDebugInfo = jest
                .fn()
                .mockImplementation(() =>
                  testNamePattern ? { ...debugInfo, testNamePattern } : debugInfo
                );
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
            expect(controllerMock.lastRunMock().errored).toHaveBeenCalledWith(
              itemDataList[0].item,
              expect.anything(),
              undefined
            );
            expect(vscode.TestMessage).toHaveBeenCalledTimes(1);
          } else {
            if (testNamePattern) {
              expect(extExplorerContextMock.debugTests).toHaveBeenCalledWith(
                'file',
                testNamePattern
              );
            } else {
              expect(extExplorerContextMock.debugTests).toHaveBeenCalledWith('file');
            }
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
        expect(controllerMock.createTestRun).toHaveBeenCalled();

        // verify seerial execution
        expect(extExplorerContextMock.debugTests).toHaveBeenCalledTimes(1);

        await finishDebug();
        expect(extExplorerContextMock.debugTests).toHaveBeenCalledTimes(2);

        await finishDebug();
        expect(extExplorerContextMock.debugTests).toHaveBeenCalledTimes(3);

        await finishDebug();
        await p;
        expect(extExplorerContextMock.debugTests).toHaveBeenCalledTimes(3);

        // the run will be closed
        expect(controllerMock.lastRunMock().end).toHaveBeenCalled();
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
        expect(controllerMock.createTestRun).toHaveBeenCalled();
        expect(extExplorerContextMock.debugTests).toHaveBeenCalledTimes(1);

        const runMock = controllerMock.lastRunMock();
        await finishDebug();
        expect(extExplorerContextMock.debugTests).toHaveBeenCalledTimes(2);

        // cancel the run during 2nd debug, the 3rd one should be skipped
        cancelToken.isCancellationRequested = true;

        await finishDebug();
        expect(extExplorerContextMock.debugTests).toHaveBeenCalledTimes(2);
        await p;

        expect(extExplorerContextMock.debugTests).toHaveBeenCalledTimes(2);
        expect(runMock.skipped).toHaveBeenCalledWith(request.include[2]);

        // the run will be closed
        expect(runMock.end).toHaveBeenCalledTimes(1);
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

        expect(extExplorerContextMock.debugTests).toHaveBeenCalledTimes(3);
        expect(runMock.errored).toHaveBeenCalledTimes(2);
        expect(runMock.errored).toHaveBeenCalledWith(
          request.include[1],
          expect.anything(),
          undefined
        );
        expect(runMock.errored).toHaveBeenCalledWith(
          request.include[2],
          expect.anything(),
          undefined
        );
        expect(runMock.end).toHaveBeenCalled();
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
            expect(tData.scheduleTest).not.toHaveBeenCalled();
          } else {
            expect(tData.scheduleTest).toHaveBeenCalled();
          }

          await expect(p).resolves.toBe(undefined);
          expect(runMock.end).toHaveBeenCalled();

          switch (state) {
            case 'errored':
              expect(runMock.errored).toHaveBeenCalledWith(
                tData.item,
                expect.anything(),
                undefined
              );
              expect(vscode.TestMessage).toHaveBeenCalledTimes(1);
              break;
            case 'skipped':
              expect(runMock.skipped).toHaveBeenCalledWith(tData.item);
              expect(vscode.TestMessage).not.toHaveBeenCalled();
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
        expect(controllerMock.createTestRun).toHaveBeenCalled();
        const runMock = controllerMock.lastRunMock();

        itemDataList.forEach((d) => {
          expect(d.scheduleTest).toHaveBeenCalled();
          const [run] = d.scheduleTest.mock.calls[0];
          expect(run).toEqual(expect.objectContaining({ vscodeRun: runMock }));
          // simulate each item is done the run
          run.end();
        });

        await p;
        expect(runMock.end).toHaveBeenCalledTimes(1);
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
        expect(controllerMock.createTestRun).toHaveBeenCalled();

        itemDataList.forEach((d) => {
          expect(d.scheduleTest).toHaveBeenCalled();
          const [run] = d.scheduleTest.mock.calls[0];
          expect(run).toEqual(expect.objectContaining({ vscodeRun: controllerMock.lastRunMock() }));
          // close the schedule
          run.end();
        });

        await p;
        expect(runMock.end).toHaveBeenCalledTimes(1);
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
        expect(controllerMock.createTestRun).toHaveBeenCalled();
        const runMock = controllerMock.lastRunMock();

        itemDataList.forEach((d, idx) => {
          expect(d.scheduleTest).toHaveBeenCalled();
          const [run] = d.scheduleTest.mock.calls[0];
          expect(run).toEqual(expect.objectContaining({ vscodeRun: controllerMock.lastRunMock() }));

          /* eslint-disable jest/no-conditional-expect */
          if (idx === 1) {
            expect(run.vscodeRun.errored).toHaveBeenCalledWith(
              d.item,
              expect.anything(),
              undefined
            );
          } else {
            expect(run.vscodeRun.errored).not.toHaveBeenCalledWith(
              d.item,
              expect.anything(),
              undefined
            );
            // close the schedule
            run.end();
          }
        });

        await p;
        expect(runMock.end).toHaveBeenCalled();
      });
      it('if no item in request, will run test for the whole workplace', async () => {
        expect.hasAssertions();

        const testProvider = new JestTestProvider(extExplorerContextMock);

        const request: any = {
          profile: { kind: vscode.TestRunProfileKind.Run },
        };

        const p = testProvider.runTests(request, cancelToken);
        const runMock = controllerMock.lastRunMock();
        expect(workspaceRootMock.scheduleTest).toHaveBeenCalledTimes(1);
        const [run] = workspaceRootMock.scheduleTest.mock.calls[0];
        expect(run).toEqual(expect.objectContaining({ vscodeRun: controllerMock.lastRunMock() }));
        run.end();

        await p;
        expect(runMock.end).toHaveBeenCalled();
      });
      it('will reject run request without profile', async () => {
        expect.hasAssertions();

        const testProvider = new JestTestProvider(extExplorerContextMock);
        const request: any = {};

        await expect(testProvider.runTests(request, cancelToken)).rejects.not.toThrow();
        expect(workspaceRootMock.scheduleTest).toHaveBeenCalledTimes(0);
        expect(controllerMock.createTestRun).not.toHaveBeenCalled();
      });
    });
  });
  describe('supports test-explorer item-menu', () => {
    it('updates item-menu context', () => {
      extExplorerContextMock.settings.autoRun.isOff = false;
      extExplorerContextMock.settings.showCoverageOnLoad = false;

      new JestTestProvider(extExplorerContextMock);
      expect(tiContextManager.setItemContext).toHaveBeenCalledWith(
        expect.objectContaining({
          workspace: extExplorerContextMock.workspace,
          key: 'jest.autoRun',
          value: true,
          itemIds: [workspaceRootMock.item.id],
        })
      );
      expect(tiContextManager.setItemContext).toHaveBeenCalledWith(
        expect.objectContaining({
          workspace: extExplorerContextMock.workspace,
          key: 'jest.coverage',
          value: false,
          itemIds: [workspaceRootMock.item.id],
        })
      );
    });
  });
  it('supports runItemCommand', () => {
    const provider = new JestTestProvider(extExplorerContextMock);
    provider.runItemCommand(workspaceRootMock.item, ItemCommand.updateSnapshot);
    expect(workspaceRootMock.runItemCommand).toHaveBeenCalled();
  });
});
