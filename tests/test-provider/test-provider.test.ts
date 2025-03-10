import '../manual-mocks';

jest.unmock('../../src/test-provider/test-provider');
jest.unmock('../../src/test-provider/test-provider-context');
jest.unmock('../../src/JestExt/run-mode');
jest.unmock('./test-helper');
jest.unmock('../../src/appGlobals');

import * as vscode from 'vscode';
import { JestTestProvider } from '../../src/test-provider/test-provider';
import { WorkspaceRoot } from '../../src/test-provider/test-item-data';
import { JestTestProviderContext } from '../../src/test-provider/test-provider-context';
import { extensionId } from '../../src/appGlobals';
import { mockController, mockExtExplorerContext } from './test-helper';
import { tiContextManager } from '../../src/test-provider/test-item-context-manager';
import { ItemCommand } from '../../src/test-provider/types';
import { RunMode } from '../../src/JestExt/run-mode';
import { JestTestRun } from '../../src/test-provider/jest-test-run';
import { JestTestCoverageProvider } from '../../src/test-provider/test-coverage';

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

  const setupItemData = (context, items = [1, 2, 3]) => {
    const itemDataList = items.map((n) => setupTestItemData(`item-${n}`, true, context));
    itemDataList.forEach((d) => {
      d.context = { workspace: { name: 'whatever' } };
      d.getDebugInfo = jest.fn().mockReturnValueOnce({});
    });
    return itemDataList;
  };

  let controllerMock;
  let extExplorerContextMock;
  let workspaceRootMock;
  let mockTestTag;
  const mockedJestTestRun = JestTestRun as jest.MockedClass<any>;
  let mockCoverageProvider: any;

  beforeEach(() => {
    jest.clearAllMocks();

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
    mockCoverageProvider = { loadDetailedCoverage: jest.fn(), dispose: jest.fn() };
    (JestTestCoverageProvider as jest.MockedClass<any>).mockReturnValue(mockCoverageProvider);
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
      expect(WorkspaceRoot).toHaveBeenCalled();
    });
    describe('profiles', () => {
      it('the default run profile', () => {
        new JestTestProvider(extExplorerContextMock);
        expect(controllerMock.createRunProfile).toHaveBeenCalledWith(
          'run tests',
          vscode.TestRunProfileKind.Run,
          expect.any(Function),
          true,
          { id: 'run' }
        );
        const profile = controllerMock.createRunProfile.mock.results.find(
          (r) => r.value.kind === vscode.TestRunProfileKind.Run
        )?.value;
        expect(profile.configureHandler).toBeDefined();
        expect(profile.runHandler).toBeDefined();
        profile.configureHandler();
        expect(vscode.commands.executeCommand).toHaveBeenCalledWith(
          expect.stringContaining(`with-workspace.change-run-mode`),
          extExplorerContextMock.workspace
        );
        expect(profile.loadDetailedCoverage).not.toBeDefined();
      });

      it('the default debug profile', () => {
        new JestTestProvider(extExplorerContextMock);
        expect(controllerMock.createRunProfile).toHaveBeenCalledWith(
          'debug tests',
          vscode.TestRunProfileKind.Debug,
          expect.any(Function),
          true,
          { id: 'debug' }
        );
        const profile = controllerMock.createRunProfile.mock.results.find(
          (r) => r.value.kind === vscode.TestRunProfileKind.Debug
        )?.value;
        expect(profile.runHandler).toBeDefined();
        expect(profile.configureHandler).not.toBeDefined();
        expect(profile.loadDetailedCoverage).not.toBeDefined();
      });
      it('the coverage profile', () => {
        new JestTestProvider(extExplorerContextMock);
        expect(controllerMock.createRunProfile).toHaveBeenCalledWith(
          'run tests with coverage',
          vscode.TestRunProfileKind.Coverage,
          expect.any(Function),
          false,
          { id: 'run' }
        );
        const profile = controllerMock.createRunProfile.mock.results.find(
          (r) => r.value.kind === vscode.TestRunProfileKind.Coverage
        )?.value;
        expect(profile.runHandler).toBeDefined();
        expect(profile.configureHandler).not.toBeDefined();
        expect(profile.loadDetailedCoverage).toBeDefined();
      });
    });
  });

  describe('can discover tests', () => {
    it('test mockedJestTestRun', () => {
      const jestRun = new JestTestRun('jest-run', {} as any, {} as any, (() => {}) as any);
      expect(jestRun.name).toBe('jest-run');
    });
    it('should only discover items with canResolveChildren = true', () => {
      new JestTestProvider(extExplorerContextMock);
      const data = setupTestItemData('whatever', true, workspaceRootMock.context);
      data.item.canResolveChildren = true;
      controllerMock.resolveHandler(data.item);
      expect(JestTestRun).toHaveBeenCalled();
      mockedJestTestRun.mockClear();

      data.item.canResolveChildren = false;
      controllerMock.resolveHandler(data.item);
      expect(mockedJestTestRun).not.toHaveBeenCalled();
    });
    describe('when no test item is requested', () => {
      it('will resolve the whole workspace via workspaceRoot', () => {
        new JestTestProvider(extExplorerContextMock);
        workspaceRootMock.item.canResolveChildren = true;
        controllerMock.resolveHandler();
        expect(workspaceRootMock.discoverTest).toHaveBeenCalledTimes(1);

        // run will be created with the controller's id
        expect(JestTestRun).toHaveBeenCalledTimes(1);
        const jestRun = mockedJestTestRun.mock.results[0].value;
        expect(jestRun.name).toEqual(expect.stringContaining(controllerMock.id));

        // run will be closed
        expect(jestRun.end).toHaveBeenCalled();
      });
    });
    describe('when specific item is requested', () => {
      it('will forward the request to the item', () => {
        new JestTestProvider(extExplorerContextMock);
        const data = setupTestItemData('whatever', true, workspaceRootMock.context);
        data.item.canResolveChildren = true;
        controllerMock.resolveHandler(data.item);

        // run will be created with the controller's id
        expect(JestTestRun).toHaveBeenCalledTimes(1);
        const jestRun = mockedJestTestRun.mock.results[0].value;
        expect(jestRun.name).toEqual(expect.stringContaining(controllerMock.id));

        // run will be closed
        expect(jestRun.end).toHaveBeenCalled();
      });
      it('should not crash if item not found in the item-data map', () => {
        new JestTestProvider(extExplorerContextMock);
        const data = makeItemData(true);
        controllerMock.resolveHandler({ canResolveChildren: true });
        expect(data.discoverTest).not.toHaveBeenCalled();
        expect(workspaceRootMock.discoverTest).not.toHaveBeenCalled();

        // run will be created with the controller's id
        expect(JestTestRun).toHaveBeenCalledTimes(1);
        const jestRun = mockedJestTestRun.mock.results[0].value;
        expect(jestRun.name).toEqual(expect.stringContaining(controllerMock.id));

        // run will be closed
        expect(jestRun.end).toHaveBeenCalled();
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
        expect(JestTestRun).toHaveBeenCalledTimes(1);
        const jestRun = mockedJestTestRun.mock.results[0].value;
        expect(jestRun.name).toEqual(expect.stringContaining(controllerMock.id));

        // run will be closed
        expect(jestRun.end).toHaveBeenCalled();
      });
    });
  });
  describe('can provide test coverage', () => {
    it('use coverageProvider to manage coverage', () => {
      new JestTestProvider(extExplorerContextMock);
      expect(JestTestCoverageProvider).toHaveBeenCalledWith(extExplorerContextMock.sessionEvents);
    });
    it('can load detailed coverage', async () => {
      new JestTestProvider(extExplorerContextMock);
      const coverageProfile = controllerMock.createRunProfile.mock.results.find(
        (r) => r.value.kind === vscode.TestRunProfileKind.Coverage
      )?.value;
      const fileCoverage = { path: 'file' };
      await coverageProfile.loadDetailedCoverage({}, fileCoverage);
      expect(mockCoverageProvider.loadDetailedCoverage).toHaveBeenCalledWith(fileCoverage);
    });
  });
  describe('upon dispose', () => {
    it('vscode.TestController will be disposed', () => {
      const testProvider = new JestTestProvider(extExplorerContextMock);
      testProvider.dispose();
      expect(controllerMock.dispose).toHaveBeenCalled();
      expect(workspaceRootMock.dispose).toHaveBeenCalled();
      expect(mockCoverageProvider.dispose).toHaveBeenCalled();
    });
  });
  describe('supports explorer UI run and debug request', () => {
    let cancelToken;

    beforeEach(() => {
      cancelToken = { onCancellationRequested: jest.fn(), isCancellationRequested: false };
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
        case | debugInfo               | testName     | debugTests                       | hasError
        ${1} | ${undefined}            | ${undefined} | ${() => Promise.resolve()}       | ${true}
        ${2} | ${{ testPath: 'file' }} | ${'a test'}  | ${() => Promise.resolve()}       | ${false}
        ${3} | ${{ testPath: 'file' }} | ${'a test'}  | ${() => Promise.reject('error')} | ${true}
        ${4} | ${{ testPath: 'file' }} | ${'a test'}  | ${throwError}                    | ${true}
        ${5} | ${{ testPath: 'file' }} | ${undefined} | ${() => Promise.resolve()}       | ${false}
      `(
        'invoke debug test async case $case => error? $hasError',
        async ({ debugInfo, testName, debugTests, hasError }) => {
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
                .mockImplementation(() => (testName ? { ...debugInfo, testName } : debugInfo));
            } else {
              d.getDebugInfo = undefined;
            }
          });
          const request: any = {
            include: itemDataList.map((d) => d.item),
            profile: { kind: vscode.TestRunProfileKind.Debug },
          };

          await expect(testProvider.runTests(request, cancelToken)).resolves.toBe(undefined);

          // run will be created
          expect(JestTestRun).toHaveBeenCalledTimes(1);
          const jestRun = mockedJestTestRun.mock.results[0].value;

          if (hasError) {
            expect(jestRun.errored).toHaveBeenCalledWith(itemDataList[0].item, expect.anything());
            expect(vscode.TestMessage).toHaveBeenCalledTimes(1);
          } else {
            if (testName) {
              expect(extExplorerContextMock.debugTests).toHaveBeenCalledWith(
                expect.objectContaining({ testPath: 'file', testName })
              );
            } else {
              expect(extExplorerContextMock.debugTests).toHaveBeenCalledWith({ testPath: 'file' });
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
        expect(JestTestRun).toHaveBeenCalledTimes(1);
        const jestRun = mockedJestTestRun.mock.results[0].value;

        // verify serial execution
        expect(extExplorerContextMock.debugTests).toHaveBeenCalledTimes(1);

        await finishDebug();
        expect(extExplorerContextMock.debugTests).toHaveBeenCalledTimes(2);

        await finishDebug();
        expect(extExplorerContextMock.debugTests).toHaveBeenCalledTimes(3);

        await finishDebug();
        await p;
        expect(extExplorerContextMock.debugTests).toHaveBeenCalledTimes(3);

        // the run will be closed
        expect(jestRun.end).toHaveBeenCalled();
      });
      it('cancellation means stop the run and skip the rest of tests', async () => {
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
        expect(JestTestRun).toHaveBeenCalledTimes(1);
        const jestRun = mockedJestTestRun.mock.results[0].value;
        const onCancel = cancelToken.onCancellationRequested.mock.calls[0][0];

        expect(extExplorerContextMock.debugTests).toHaveBeenCalledTimes(1);

        await finishDebug();
        expect(extExplorerContextMock.debugTests).toHaveBeenCalledTimes(2);

        // cancel the run during 2nd debug, the 3rd one should be skipped
        cancelToken.isCancellationRequested = true;
        onCancel();
        expect(jestRun.cancel).toHaveBeenCalled();

        await finishDebug();
        expect(extExplorerContextMock.debugTests).toHaveBeenCalledTimes(2);
        await p;

        expect(extExplorerContextMock.debugTests).toHaveBeenCalledTimes(2);
        expect(jestRun.skipped).toHaveBeenCalledWith(request.include[2]);

        // the run will be closed
        expect(jestRun.end).toHaveBeenCalledTimes(1);
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

        expect(JestTestRun).toHaveBeenCalledTimes(1);
        const jestRun = mockedJestTestRun.mock.results[0].value;

        expect(extExplorerContextMock.debugTests).toHaveBeenCalledTimes(3);
        expect(jestRun.errored).toHaveBeenCalledTimes(2);
        expect(jestRun.errored).toHaveBeenCalledWith(request.include[1], expect.anything());
        expect(jestRun.errored).toHaveBeenCalledWith(request.include[2], expect.anything());
        expect(jestRun.end).toHaveBeenCalled();
      });
    });
    describe('run tests', () => {
      const resolveSchedule = (_r, resolve) => {
        resolve();
      };
      describe('run test should update test item status', () => {
        it.each`
          case | scheduleTest       | isCancelled | state
          ${1} | ${resolveSchedule} | ${false}    | ${undefined}
          ${2} | ${resolveSchedule} | ${true}     | ${'skipped'}
          ${3} | ${throwError}      | ${false}    | ${'errored'}
        `('case $case', async ({ scheduleTest, isCancelled, state }) => {
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

          expect(JestTestRun).toHaveBeenCalledTimes(1);
          const jestRun = mockedJestTestRun.mock.results[0].value;

          if (isCancelled) {
            expect(tData.scheduleTest).not.toHaveBeenCalled();
          } else {
            expect(tData.scheduleTest).toHaveBeenCalled();
          }

          await expect(p).resolves.toBe(undefined);
          expect(jestRun.end).toHaveBeenCalled();

          switch (state) {
            case 'errored':
              expect(jestRun.errored).toHaveBeenCalledWith(tData.item, expect.anything());
              expect(vscode.TestMessage).toHaveBeenCalledTimes(1);
              break;
            case 'skipped':
              expect(jestRun.skipped).toHaveBeenCalledWith(tData.item);
              expect(vscode.TestMessage).not.toHaveBeenCalled();
              break;
            case undefined:
              break;
            default:
              expect('unhandled state type').toBeUndefined();
              break;
          }
        });
      });
      it('running tests in parallel', async () => {
        expect.hasAssertions();

        const testProvider = new JestTestProvider(extExplorerContextMock);
        const itemDataList = setupItemData(workspaceRootMock.context);

        const request: any = {
          include: itemDataList.map((d) => d.item),
          profile: { kind: vscode.TestRunProfileKind.Run },
        };

        const p = testProvider.runTests(request, cancelToken);

        // a run is created
        expect(JestTestRun).toHaveBeenCalled();
        const jestRun = mockedJestTestRun.mock.results[0].value;

        itemDataList.forEach((d) => {
          expect(d.scheduleTest).toHaveBeenCalled();
          const [run] = d.scheduleTest.mock.calls[0];
          expect(run).toEqual(jestRun);
          // simulate each item is done the run
          run.end();
        });

        await p;
        expect(jestRun.end).toHaveBeenCalledTimes(itemDataList.length + 1);
      });

      it('cancellation will cancel all testRun and items', async () => {
        expect.hasAssertions();

        const testProvider = new JestTestProvider(extExplorerContextMock);
        const itemDataList = setupItemData(workspaceRootMock.context);
        itemDataList.forEach((d, idx) => d.scheduleTest.mockReturnValueOnce(`pid-${idx}`));

        const request: any = {
          include: itemDataList.map((d) => d.item),
          profile: { kind: vscode.TestRunProfileKind.Run },
        };
        const p = testProvider.runTests(request, cancelToken);
        const onCancel = cancelToken.onCancellationRequested.mock.calls[0][0];

        // cancel the run
        cancelToken.isCancellationRequested = true;
        onCancel();

        // a run is already created
        expect(JestTestRun).toHaveBeenCalledTimes(1);
        const jestRun = mockedJestTestRun.mock.results[0].value;
        expect(jestRun.cancel).toHaveBeenCalled();

        itemDataList.forEach((d) => {
          expect(d.scheduleTest).toHaveBeenCalled();
          const [run] = d.scheduleTest.mock.calls[0];
          expect(run).toBe(jestRun);
          // close the schedule
          run.end();
        });

        await p;
        expect(jestRun.end).toHaveBeenCalledTimes(itemDataList.length + 1);
      });
      describe('can handle exception', () => {
        it('when schedule test failed', async () => {
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

          // cancel after run
          cancelToken.isCancellationRequested = true;

          // a run is already created
          expect(JestTestRun).toHaveBeenCalledTimes(1);
          const jestRun = mockedJestTestRun.mock.results[0].value;

          itemDataList.forEach((d, idx) => {
            expect(d.scheduleTest).toHaveBeenCalled();
            const [run] = d.scheduleTest.mock.calls[0];
            expect(run).toEqual(jestRun);

            if (idx === 1) {
              expect(run.errored).toHaveBeenCalledWith(d.item, expect.anything());
            } else {
              expect(run.errored).not.toHaveBeenCalledWith(d.item, expect.anything());
            }
            // close the schedule
            run.end();
          });

          await p;
          expect(jestRun.end).toHaveBeenCalledTimes(itemDataList.length + 1);
        });
      });
      it('if no item in request, will run test for the whole workplace', async () => {
        expect.hasAssertions();

        const testProvider = new JestTestProvider(extExplorerContextMock);

        const request: any = {
          profile: { kind: vscode.TestRunProfileKind.Run },
        };

        const p = testProvider.runTests(request, cancelToken);

        expect(JestTestRun).toHaveBeenCalledTimes(1);
        const jestRun = mockedJestTestRun.mock.results[0].value;
        expect(workspaceRootMock.scheduleTest).toHaveBeenCalledTimes(1);
        const [run] = workspaceRootMock.scheduleTest.mock.calls[0];
        expect(run).toBe(jestRun);

        await p;
        expect(jestRun.end).toHaveBeenCalledTimes(1);
      });
      it('if request has exclude, will run test for the whole workplace except the exclude', async () => {
        expect.hasAssertions();

        const testProvider = new JestTestProvider(extExplorerContextMock);

        const request: any = {
          exclude: [workspaceRootMock.item],
          profile: { kind: vscode.TestRunProfileKind.Run },
        };

        const p = testProvider.runTests(request, cancelToken);

        expect(JestTestRun).toHaveBeenCalledTimes(1);
        const jestRun = mockedJestTestRun.mock.results[0].value;
        expect(workspaceRootMock.scheduleTest).not.toHaveBeenCalled();

        await p;
        expect(jestRun.end).toHaveBeenCalledTimes(1);
      });
      it('will reject run request without profile', async () => {
        expect.hasAssertions();

        const testProvider = new JestTestProvider(extExplorerContextMock);
        const request: any = {};

        await expect(testProvider.runTests(request, cancelToken)).rejects.not.toThrow();
        expect(workspaceRootMock.scheduleTest).toHaveBeenCalledTimes(0);
        expect(JestTestRun).not.toHaveBeenCalled();
      });
    });
  });

  describe('supports test-explorer item-menu', () => {
    it('updates item-menu context', () => {
      new JestTestProvider(extExplorerContextMock);
      expect(tiContextManager.setItemContext).toHaveBeenCalledWith(
        expect.objectContaining({
          workspace: extExplorerContextMock.workspace,
          key: 'jest.runMode',
          itemIds: [workspaceRootMock.item.id],
        })
      );
      expect(tiContextManager.setItemContext).toHaveBeenCalledWith(
        expect.objectContaining({
          workspace: extExplorerContextMock.workspace,
          key: 'jest.workspaceRoot',
          itemIds: [workspaceRootMock.item.id],
        })
      );
    });
  });
  describe('support direct invocation of runTests', () => {
    it('use runTests after exiting defer mode', async () => {
      expect.hasAssertions();

      const testProvider = new JestTestProvider(extExplorerContextMock);
      const itemDataList = setupItemData(workspaceRootMock.context);

      const requestFromSpy = jest.spyOn(workspaceRootMock.context, 'requestFrom');
      requestFromSpy.mockImplementation((r) => r);
      const createTestRunSpy = jest.spyOn(workspaceRootMock.context, 'createTestRun');

      const request: any = {
        include: [itemDataList[0].item],
        profile: { kind: vscode.TestRunProfileKind.Run },
      };
      await testProvider.runTests(request, undefined, true);
      expect(requestFromSpy).toHaveBeenCalledWith(request);
      expect(createTestRunSpy).toHaveBeenCalled();
    });
  });
  describe('runItemCommand', () => {
    it('supports runItemCommand', () => {
      const provider = new JestTestProvider(extExplorerContextMock);
      provider.runItemCommand(workspaceRootMock.item, ItemCommand.updateSnapshot);
      expect(workspaceRootMock.runItemCommand).toHaveBeenCalled();
    });
    it('if no itemData found, will not crash', () => {
      const provider = new JestTestProvider(extExplorerContextMock);
      provider.runItemCommand({ id: 'not-found' } as any, ItemCommand.updateSnapshot);
      expect(workspaceRootMock.runItemCommand).not.toHaveBeenCalled();
    });
  });
  it('will exit defer mode upon any run request', async () => {
    expect.hasAssertions();

    const runMode = new RunMode({ type: 'on-demand', deferred: true });
    extExplorerContextMock.settings.runMode = runMode;
    const provider = new JestTestProvider(extExplorerContextMock);

    const request: any = {
      include: {},
      profile: { kind: vscode.TestRunProfileKind.Debug },
    };
    await provider.runTests(request, {} as any);
    expect(vscode.commands.executeCommand).toHaveBeenCalledWith(
      expect.stringContaining('with-workspace.exit-defer-mode'),
      extExplorerContextMock.workspace,
      expect.objectContaining({ request })
    );
    expect(JestTestRun).not.toHaveBeenCalled();
  });
});
