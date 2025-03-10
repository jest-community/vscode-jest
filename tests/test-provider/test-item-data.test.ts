import '../manual-mocks';

jest.unmock('../../src/test-provider/test-item-data');
jest.unmock('../../src/test-provider/test-provider-context');
jest.unmock('../../src/appGlobals');
jest.unmock('../../src/TestResults/match-node');
jest.unmock('../../src/virtual-workspace-folder');
jest.unmock('../../src/TestResults/match-by-context');
jest.unmock('../test-helper');
jest.unmock('./test-helper');
jest.unmock('../../src/errors');
jest.unmock('../../src/JestExt/run-mode');

import { JestTestProviderContext } from '../../src/test-provider/test-provider-context';
import { JestTestRun } from '../../src/test-provider/jest-test-run';
import { tiContextManager } from '../../src/test-provider/test-item-context-manager';
import { toAbsoluteRootPath } from '../../src/helpers';
import { outputManager } from '../../src/output-manager';

jest.mock('path', () => {
  let sep = '/';
  return {
    relative: (p1, p2) => {
      const p = p2.split(p1)[1];
      if (p[0] === sep) {
        return p.slice(1);
      }
      return p;
    },
    basename: (p) => p.split(sep).slice(-1),
    sep,
    setSep: (newSep: string) => {
      sep = newSep;
    },
  };
});

import * as vscode from 'vscode';
import {
  FolderData,
  TestData,
  TestDocumentRoot,
  WorkspaceRoot,
} from '../../src/test-provider/test-item-data';
import * as helper from '../test-helper';
import {
  buildAssertionContainer,
  buildSourceContainer,
} from '../../src/TestResults/match-by-context';
import * as path from 'path';
import { mockController, mockExtExplorerContext, mockJestProcess } from './test-helper';
import * as errors from '../../src/errors';
import { ItemCommand } from '../../src/test-provider/types';
import { RunMode } from '../../src/JestExt/run-mode';
import { VirtualWorkspaceFolder } from '../../src/virtual-workspace-folder';
import { ProcessStatus } from '../../src/JestProcessManagement';

const mockPathSep = (newSep: string) => {
  (path as jest.Mocked<any>).setSep(newSep);
  (path as jest.Mocked<any>).sep = newSep;
};

const getChildItem = (item: vscode.TestItem, partialId: string): vscode.TestItem | undefined => {
  let found;
  item.children.forEach((child) => {
    if (!found && child.id.includes(partialId)) {
      found = child;
    }
  });
  return found;
};

const mockScheduleProcess = (context, id = 'whatever') => {
  const process: any = mockJestProcess(id, { request: { type: 'watch-tests' } });
  context.ext.session.scheduleProcess.mockImplementation((request, userData) => {
    process.request = request;
    process.userData = userData;
    return process;
  });
  return process;
};

describe('test-item-data', () => {
  let context;
  let controllerMock;
  let contextCreateTestRunSpy;
  const mockedJestTestRun = JestTestRun as jest.MockedClass<any>;

  const createTestRun = (opt?: any): any => {
    const run = context.createTestRun(opt?.request ?? {}, opt);
    return run;
  };
  const prepareTestResult = (): void => {
    const assertions = [];
    assertions.push(
      helper.makeAssertion('test-a', 'KnownFail', [], [1, 0], {
        message: 'test error',
      })
    );

    const assertionContainer = buildAssertionContainer(assertions);
    const testSuiteResult: any = {
      status: 'KnownFail',
      message: 'test file failed',
      assertionContainer,
    };
    context.ext.testResultProvider.getTestSuiteResult.mockReturnValue(testSuiteResult);
  };

  const setupTestEnv = (withAction = true) => {
    const file = '/ws-1/tests/a.test.ts';
    context.ext.testResultProvider.getTestList.mockReturnValueOnce([file]);
    const wsRoot = new WorkspaceRoot(context);
    const onRunEvent = context.ext.sessionEvents.onRunEvent.event.mock.calls[0][0];
    const process = mockScheduleProcess(context);

    // build out the test item tree
    prepareTestResult();

    if (withAction) {
      // triggers testSuiteChanged event listener
      context.ext.testResultProvider.events.testSuiteChanged.event.mock.calls[0][0]({
        type: 'assertions-updated',
        process,
        files: [file],
      });
    }

    const folder = getChildItem(wsRoot.item, 'tests');
    const testFile = getChildItem(folder, 'a.test.ts');
    const testBlock = getChildItem(testFile, 'test-a');

    const scheduleItem = (type: string) => {
      const getItem = () => {
        switch (type) {
          case 'workspace':
            return wsRoot.item;
          case 'folder':
            return folder;
          case 'testFile':
            return testFile;
          case 'testBlock':
            return testBlock;
        }
      };
      const item = getItem();
      const data = context.getData(item);
      const jestRun = createTestRun();
      data.scheduleTest(jestRun);

      return item;
    };

    return { wsRoot, folder, testFile, testBlock, onRunEvent, process, scheduleItem, file };
  };

  const createAllTestItems = () => {
    const wsRoot = new WorkspaceRoot(context);
    const folder = new FolderData(context, 'tests', wsRoot.item);
    const uri: any = { fsPath: '/ws-1/tests/a.test.ts' };
    const doc = new TestDocumentRoot(context, uri, folder.item);
    const node: any = { fullName: 'a test', attrs: {}, data: {} };
    const testItem = new TestData(context, uri, node, doc.item);
    return { wsRoot, folder, doc, testItem };
  };
  // like createAllTestItems but with added a describe block
  const createTestDataTree = () => {
    const { wsRoot, folder, doc, testItem } = createAllTestItems();
    const node1: any = { fullName: 'describe', attrs: {}, data: {} };
    const desc = new TestData(context, doc.uri, node1, doc.item);
    const node2: any = { fullName: 'describe test 2', attrs: {}, data: {} };
    const test2 = new TestData(context, doc.uri, node2, desc.item);
    return { wsRoot, folder, doc, testItem, desc, test2 };
  };

  beforeEach(() => {
    controllerMock = mockController();
    const profiles: any = [
      { tag: { id: 'run' } },
      { tag: { id: 'debug' } },
      { tag: { id: 'update-snapshot' } },
    ];
    context = new JestTestProviderContext(mockExtExplorerContext('ws-1'), controllerMock, profiles);
    context.output.write = jest.fn((t) => t);
    context.output.show = jest.fn();

    contextCreateTestRunSpy = jest.spyOn(context, 'createTestRun');
    mockedJestTestRun.mockClear();

    vscode.Uri.joinPath = jest
      .fn()
      .mockImplementation((uri, p) => ({ fsPath: `${uri.fsPath}/${p}` }));
    vscode.Uri.file = jest.fn().mockImplementation((f) => ({ fsPath: f }));
    (tiContextManager.setItemContext as jest.Mocked<any>).mockClear();

    (vscode.Location as jest.Mocked<any>).mockReturnValue({});
    (toAbsoluteRootPath as jest.Mocked<any>).mockImplementation((p) => p.uri.fsPath);
  });
  describe('discover children', () => {
    describe('WorkspaceRoot', () => {
      it('has no parent item and the id should contain the workspace name', () => {
        const wsRoot = new WorkspaceRoot(context);
        expect(wsRoot.item.parent).toBeUndefined();
        expect(wsRoot.item.id).toEqual(expect.stringContaining(`:${context.ext.workspace.name}`));
      });
      it('create test document tree for testFiles list', () => {
        const testFiles = [
          '/ws-1/src/a.test.ts',
          '/ws-1/src/b.test.ts',
          '/ws-1/src/app/app.test.ts',
        ];
        context.ext.testResultProvider.getTestList.mockReturnValue(testFiles);
        const wsRoot = new WorkspaceRoot(context);
        const jestRun = createTestRun();
        wsRoot.discoverTest(jestRun);

        // verify tree structure
        expect(wsRoot.item.children.size).toEqual(1);
        wsRoot.item.children.forEach((child) => {
          expect(child.id).toEqual(expect.stringContaining('src'));
          expect(context.getData(child) instanceof FolderData).toBeTruthy();
          expect(child.children.size).toEqual(3);

          // app.test.ts
          const appItem = getChildItem(child, 'app');
          const aItem = getChildItem(child, 'a.test.ts');
          const bItem = getChildItem(child, 'b.test.ts');

          expect(context.getData(appItem) instanceof FolderData).toBeTruthy();
          expect(appItem.children.size).toEqual(1);
          const appFileItem = getChildItem(appItem, 'app.test.ts');
          expect(context.getData(appFileItem) instanceof TestDocumentRoot).toBeTruthy();
          expect(appFileItem.children.size).toEqual(0);

          [aItem, bItem].forEach((fItem) => {
            expect(context.getData(fItem) instanceof TestDocumentRoot).toBeTruthy();
            expect(fItem.children.size).toEqual(0);
          });
        });

        //verify state after the discovery
        expect(wsRoot.item.canResolveChildren).toBe(false);
      });
      describe('when no testFiles yet', () => {
        it('if no testFiles yet, will still turn off canResolveChildren and close the run', () => {
          context.ext.testResultProvider.getTestList.mockReturnValue([]);
          const wsRoot = new WorkspaceRoot(context);
          const jestRun = createTestRun();
          wsRoot.discoverTest(jestRun);
          expect(wsRoot.item.children.size).toEqual(0);
          expect(wsRoot.item.canResolveChildren).toBe(false);
          expect(jestRun.end).toHaveBeenCalledTimes(1);
        });
        it('will not wipe out existing test items', () => {
          // first time discover 1 file
          context.ext.testResultProvider.getTestList.mockReturnValue(['/ws-1/a.test.ts']);
          const wsRoot = new WorkspaceRoot(context);
          let jestRun = createTestRun();
          wsRoot.discoverTest(jestRun);
          expect(wsRoot.item.children.size).toEqual(1);
          expect(wsRoot.item.canResolveChildren).toBe(false);
          expect(jestRun.end).toHaveBeenCalledTimes(1);

          // 2nd time if no test-file: testItems will not change
          context.ext.testResultProvider.getTestList.mockReturnValue([]);
          jestRun = createTestRun();
          wsRoot.discoverTest(jestRun);
          expect(wsRoot.item.children.size).toEqual(1);
          expect(wsRoot.item.canResolveChildren).toBe(false);
          expect(jestRun.end).toHaveBeenCalledTimes(1);
        });
      });
      it('will only discover up to the test file level', () => {
        const a1 = helper.makeAssertion('test-1', 'KnownSuccess', [], [1, 0]);
        const assertionContainer = buildAssertionContainer([a1]);
        const testFiles = ['/ws-1/a.test.ts'];
        context.ext.testResultProvider.getTestList.mockReturnValue(testFiles);
        context.ext.testResultProvider.getTestSuiteResult.mockReturnValue({
          status: 'KnownSuccess',
          assertionContainer,
        });
        const wsRoot = new WorkspaceRoot(context);
        const jestRun = createTestRun();
        wsRoot.discoverTest(jestRun);
        const docItem = wsRoot.item.children.get(testFiles[0]);
        expect(docItem.children.size).toEqual(0);
        expect(context.ext.testResultProvider.getTestSuiteResult).toHaveBeenCalled();
      });
      it('will remove folder item if no test file exist any more', () => {
        const a1 = helper.makeAssertion('test-1', 'KnownSuccess', [], [1, 0]);
        const assertionContainer = buildAssertionContainer([a1]);
        const testFiles = ['/ws-1/tests1/a.test.ts', '/ws-1/tests2/b.test.ts'];
        context.ext.testResultProvider.getTestList.mockReturnValue(testFiles);
        context.ext.testResultProvider.getTestSuiteResult.mockReturnValue({
          status: 'KnownSuccess',
          assertionContainer,
        });
        const wsRoot = new WorkspaceRoot(context);

        // first discover all test files and build the tree
        let jestRun = createTestRun();
        wsRoot.discoverTest(jestRun);
        expect(wsRoot.item.children.size).toEqual(2);
        let folderItem = wsRoot.item.children.get('/ws-1/tests1');
        let docItem = folderItem.children.get(testFiles[0]);
        expect(docItem).not.toBeUndefined();
        folderItem = wsRoot.item.children.get('/ws-1/tests2');
        docItem = folderItem.children.get(testFiles[1]);
        expect(docItem).not.toBeUndefined();

        // now remove '/ws-1/tests2/b.test.ts' and rediscover
        testFiles.length = 1;
        jestRun = createTestRun();
        wsRoot.discoverTest(jestRun);
        expect(wsRoot.item.children.size).toEqual(1);
        folderItem = wsRoot.item.children.get('/ws-1/tests2');
        expect(folderItem).toBeUndefined();
        folderItem = wsRoot.item.children.get('/ws-1/tests1');
        docItem = folderItem.children.get(testFiles[0]);
        expect(docItem).not.toBeUndefined();
      });

      describe('external events can trigger test tree changes', () => {
        beforeEach(() => {
          (vscode.Range as jest.Mocked<any>).mockImplementation((n1, n2, n3, n4) => ({
            args: [n1, n2, n3, n4],
          }));
          (vscode.Location as jest.Mocked<any>).mockImplementation((uri, range) => ({
            uri,
            range,
          }));

          (vscode.TestMessage as jest.Mocked<any>).mockImplementation((message) => ({
            message,
          }));
        });
        it('register for jest session run events', () => {
          new WorkspaceRoot(context);
          expect(context.ext.sessionEvents.onRunEvent.event).toHaveBeenCalled();
        });
        it('register for test result events', () => {
          new WorkspaceRoot(context);
          expect(context.ext.testResultProvider.events.testListUpdated.event).toHaveBeenCalled();
          expect(context.ext.testResultProvider.events.testSuiteChanged.event).toHaveBeenCalled();
        });
        it('unregister events upon dispose', () => {
          const wsRoot = new WorkspaceRoot(context);

          const listeners = [
            context.ext.testResultProvider.events.testListUpdated.event.mock.results[0].value,
            context.ext.testResultProvider.events.testSuiteChanged.event.mock.results[0].value,
            context.ext.sessionEvents.onRunEvent.event.mock.results[0].value,
          ];
          wsRoot.dispose();
          listeners.forEach((l) => expect(l.dispose).toHaveBeenCalled());
        });
        describe('when testFile list is changed', () => {
          it('testListUpdated event will be fired', () => {
            const wsRoot = new WorkspaceRoot(context);
            context.ext.testResultProvider.getTestList.mockReturnValueOnce([]);

            const jestRun = context.createTestRun({});
            wsRoot.discoverTest(jestRun);
            expect(wsRoot.item.children.size).toBe(0);

            expect(jestRun.end).toHaveBeenCalledTimes(1);

            // invoke testListUpdated event listener
            mockedJestTestRun.mockClear();
            context.ext.testResultProvider.events.testListUpdated.event.mock.calls[0][0]([
              '/ws-1/a.test.ts',
            ]);
            // should have created a new JestTestRun but without the actual vscode.TestRun
            expect(JestTestRun).toHaveBeenCalledTimes(1);
            const jestRun2 = mockedJestTestRun.mock.results[0].value;

            expect(wsRoot.item.children.size).toBe(1);
            const docItem = getChildItem(wsRoot.item, 'a.test.ts');
            expect(docItem).not.toBeUndefined();
            expect(jestRun2.end).toHaveBeenCalled();
          });
        });
        describe('when testSuiteChanged.assertions-updated event filed', () => {
          it('all item data will be updated accordingly', () => {
            context.ext.testResultProvider.getTestList.mockReturnValueOnce([]);
            const runMode = new RunMode({ type: 'watch', showInlineError: true });
            context.ext.settings = { runMode };

            const wsRoot = new WorkspaceRoot(context);
            const jestRun = createTestRun();
            wsRoot.discoverTest(jestRun);

            expect(wsRoot.item.children.size).toBe(0);

            // assertions are available now
            const a1 = helper.makeAssertion('test-a', 'KnownFail', [], [1, 0], {
              message: 'test error',
              line: 2,
            });
            const assertionContainer = buildAssertionContainer([a1]);
            const testSuiteResult: any = {
              status: 'KnownFail',
              message: 'test file failed',
              assertionContainer,
            };
            context.ext.testResultProvider.getTestSuiteResult.mockReturnValue(testSuiteResult);

            // triggers testSuiteChanged event listener
            contextCreateTestRunSpy.mockClear();
            mockedJestTestRun.mockClear();

            // mock a non-watch process that is still running
            const process = {
              id: 'whatever',
              request: { type: 'watch-tests' },
            };
            context.ext.testResultProvider.events.testSuiteChanged.event.mock.calls[0][0]({
              type: 'assertions-updated',
              process,
              files: ['/ws-1/a.test.ts'],
            });
            const run = mockedJestTestRun.mock.results[0].value;
            expect(run.failed).toHaveBeenCalledTimes(1);
            expect(run.end).toHaveBeenCalledTimes(1);

            expect(wsRoot.item.children.size).toBe(1);
            const docItem = getChildItem(wsRoot.item, 'a.test.ts');
            expect(docItem).not.toBeUndefined();
            expect(run.failed).not.toHaveBeenCalledWith(
              docItem,
              {
                message: testSuiteResult.message,
              },
              undefined
            );

            expect(docItem.children.size).toEqual(1);
            const tItem = getChildItem(docItem, 'test-a');
            expect(tItem).not.toBeUndefined();
            expect(tItem.range).toEqual({ args: [1, 0, 1, 0] });

            // error location within message
            expect(run.failed).toHaveBeenCalledWith(tItem, {
              message: a1.message,
              location: expect.objectContaining({ range: { args: [1, 0, 1, 0] } }),
            });
          });
          describe('will auto stop zombie process', () => {
            it.each`
              case | processStatus              | isWatchMode | autoStopCalled
              ${1} | ${ProcessStatus.Running}   | ${true}     | ${false}
              ${2} | ${ProcessStatus.Running}   | ${false}    | ${true}
              ${3} | ${ProcessStatus.Done}      | ${false}    | ${false}
              ${4} | ${ProcessStatus.Done}      | ${true}     | ${false}
              ${5} | ${ProcessStatus.Cancelled} | ${false}    | ${false}
            `('case $case', ({ processStatus, isWatchMode, autoStopCalled }) => {
              const wsRoot = new WorkspaceRoot(context);
              expect(wsRoot.item.children.size).toBe(0);

              const run = createTestRun();
              const process = {
                id: 'whatever',
                request: { type: 'watch-tests' },
                status: processStatus,
                isWatchMode,
                userData: { run },
                autoStop: jest.fn(),
              };
              context.ext.testResultProvider.events.testSuiteChanged.event.mock.calls[0][0]({
                type: 'assertions-updated',
                process,
                files: [],
              });
              // no tests items to be added
              expect(run.end).toHaveBeenCalled();
              if (autoStopCalled) {
                expect(process.autoStop).toHaveBeenCalledTimes(1);
                const [delay, onCancel] = process.autoStop.mock.calls[0];
                expect(delay).toBeGreaterThan(1000);
                context.output.write.mockClear();
                onCancel();
                expect(context.output.write).toHaveBeenCalledWith(expect.anything(), 'warn');
              } else {
                expect(process.autoStop).not.toHaveBeenCalled();
              }
            });
          });
          it('if nothing is updated, output the message', () => {
            const wsRoot = new WorkspaceRoot(context);
            expect(wsRoot.item.children.size).toBe(0);

            const run = createTestRun();
            context.ext.testResultProvider.events.testSuiteChanged.event.mock.calls[0][0]({
              type: 'assertions-updated',
              process: { id: 'whatever', request: { type: 'watch-tests' }, userData: { run } },
              files: [],
            });
            // no tests items to be added
            expect(wsRoot.item.children.size).toBe(0);

            expect(run.write).toHaveBeenCalledWith(
              expect.stringContaining('No tests'),
              expect.anything()
            );
            expect(run.end).toHaveBeenCalled();
          });
        });
        describe('when testSuiteChanged.result-matched event fired', () => {
          it('test data range and snapshot context will be updated accordingly', () => {
            // assertion should be discovered prior
            context.ext.testResultProvider.getTestList.mockReturnValueOnce(['/ws-1/a.test.ts']);

            const a1 = helper.makeAssertion('test-a', 'KnownFail', ['desc-1'], [1, 0]);
            const b1 = helper.makeAssertion('test-b', 'KnownSuccess', ['desc-1'], [5, 0]);
            const assertionContainer = buildAssertionContainer([a1, b1]);
            context.ext.testResultProvider.getTestSuiteResult.mockReturnValue({
              status: 'KnownFail',
              assertionContainer,
            });

            const wsRoot = new WorkspaceRoot(context);
            const jestRun = createTestRun();
            wsRoot.discoverTest(jestRun);
            expect(context.ext.testResultProvider.getTestSuiteResult).toHaveBeenCalledTimes(1);

            expect(wsRoot.item.children.size).toBe(1);
            const docItem = getChildItem(wsRoot.item, 'a.test.ts');
            expect(docItem.children.size).toEqual(0);

            // after jest test run, result suite should be updated and test block should be populated
            context.ext.testResultProvider.events.testSuiteChanged.event.mock.calls[0][0]({
              type: 'assertions-updated',
              process: { id: 'whatever', request: { type: 'watch-tests' } },
              files: ['/ws-1/a.test.ts'],
            });
            expect(docItem.children.size).toEqual(1);
            const dItem = getChildItem(docItem, 'desc-1');
            expect(dItem.range).toEqual({ args: [1, 0, 1, 0] });
            const aItem = getChildItem(dItem, 'test-a');
            expect(aItem.range).toEqual({ args: [1, 0, 1, 0] });
            const bItem = getChildItem(dItem, 'test-b');
            expect(bItem.range).toEqual({ args: [5, 0, 5, 0] });

            expect(context.ext.testResultProvider.getTestSuiteResult).toHaveBeenCalled();
            // controllerMock.createTestRun.mockClear();
            context.ext.testResultProvider.getTestSuiteResult.mockClear();

            // after match, the assertion nodes would have updated range
            const descNode = assertionContainer.childContainers[0];
            descNode.attrs.range = {
              start: { line: 1, column: 2 },
              end: { line: 13, column: 4 },
            };
            const test_a = descNode.childData[0];
            test_a.attrs.range = {
              start: { line: 2, column: 2 },
              end: { line: 5, column: 5 },
            };
            // add snapshot marker
            test_a.attrs.snapshot = 'inline';

            const test_b = descNode.childData[1];
            test_b.attrs.range = {
              start: { line: 6, column: 6 },
              end: { line: 10, column: 10 },
            };
            // add snapshot marker
            test_b.attrs.snapshot = 'inline';

            // triggers testSuiteChanged event listener
            context.ext.testResultProvider.events.testSuiteChanged.event.mock.calls[0][0]({
              type: 'result-matched',
              file: '/ws-1/a.test.ts',
            });

            // no run should be created as we are not changing any test item tree
            // expect(controllerMock.createTestRun).not.toHaveBeenCalled();
            expect(context.ext.testResultProvider.getTestSuiteResult).not.toHaveBeenCalled();

            // expect the item's range has picked up the updated nodes
            expect(dItem.range).toEqual({
              args: [
                descNode.attrs.range.start.line,
                descNode.attrs.range.start.column,
                descNode.attrs.range.end.line,
                descNode.attrs.range.end.column,
              ],
            });
            expect(aItem.range).toEqual({
              args: [
                test_a.attrs.range.start.line,
                test_a.attrs.range.start.column,
                test_a.attrs.range.end.line,
                test_a.attrs.range.end.column,
              ],
            });
            expect(bItem.range).toEqual({
              args: [
                test_b.attrs.range.start.line,
                test_b.attrs.range.start.column,
                test_b.attrs.range.end.line,
                test_b.attrs.range.end.column,
              ],
            });

            // snapshot menu context is populated
            expect(tiContextManager.setItemContext).toHaveBeenCalledTimes(2);
            expect(tiContextManager.setItemContext).toHaveBeenCalledWith(
              expect.objectContaining({
                key: 'jest.editor-update-snapshot',
                itemIds: [aItem.id, dItem.id, docItem.id, wsRoot.item.id, bItem.id],
              })
            );
            expect(tiContextManager.setItemContext).toHaveBeenCalledWith(
              expect.objectContaining({
                key: 'jest.editor-view-snapshot',
                itemIds: [],
              })
            );
          });
        });
        describe('testSuiteChanged events when not able to show assertions', () => {
          it('result-match-failed: test items will be added and snapshot context updated accordingly', () => {
            // assertion should be discovered prior
            context.ext.testResultProvider.getTestList.mockReturnValueOnce(['/ws-1/a.test.ts']);

            const t1 = helper.makeItBlock('test-1', [1, 1, 5, 1]);
            const t2 = helper.makeItBlock('test-2', [6, 1, 7, 1]);
            const sourceRoot = helper.makeRoot([t2, t1]);
            const sourceContainer = buildSourceContainer(sourceRoot);
            const node1 = sourceContainer.childData.find((child) => child.fullName === 'test-1');
            const node2 = sourceContainer.childData.find((child) => child.fullName === 'test-2');
            node1.attrs = { ...node1.attrs, snapshot: 'external' };
            node2.attrs = { ...node2.attrs, snapshot: 'external', nonLiteralName: true };

            const wsRoot = new WorkspaceRoot(context);
            const jestRun = createTestRun();
            wsRoot.discoverTest(jestRun);
            expect(context.ext.testResultProvider.getTestSuiteResult).toHaveBeenCalledTimes(1);

            expect(wsRoot.item.children.size).toBe(1);
            const docItem = getChildItem(wsRoot.item, 'a.test.ts');
            expect(docItem.children.size).toEqual(0);
            // controllerMock.createTestRun.mockClear();
            context.ext.testResultProvider.getTestSuiteResult.mockClear();

            context.ext.testResultProvider.events.testSuiteChanged.event.mock.calls[0][0]({
              type: 'result-match-failed',
              file: '/ws-1/a.test.ts',
              sourceContainer,
            });
            expect(docItem.children.size).toEqual(2);
            const tItem1 = getChildItem(docItem, 'test-1');
            expect(tItem1.range).toEqual({ args: [0, 0, 4, 0] });
            const tItem2 = getChildItem(docItem, 'test-2');
            expect(tItem2.range).toEqual({ args: [5, 0, 6, 0] });

            expect(context.ext.testResultProvider.getTestSuiteResult).toHaveBeenCalledTimes(1);

            // snapshot menu context is populated for "test-1" only
            expect(tiContextManager.setItemContext).toHaveBeenCalledTimes(2);
            expect(tiContextManager.setItemContext).toHaveBeenCalledWith(
              expect.objectContaining({
                key: 'jest.editor-view-snapshot',
                itemIds: [tItem1.id],
              })
            );
            expect(tiContextManager.setItemContext).toHaveBeenCalledWith(
              expect.objectContaining({
                key: 'jest.editor-update-snapshot',
                itemIds: [tItem1.id, docItem.id, wsRoot.item.id],
              })
            );
          });
        });
      });
      it('can preserve parse-result occurred before discover', () => {
        const wsRoot = new WorkspaceRoot(context);

        // record parse result
        const t1 = helper.makeItBlock('test-1', [1, 1, 5, 1]);
        const t2 = helper.makeItBlock('test-2', [6, 1, 7, 1]);
        const sourceRoot = helper.makeRoot([t2, t1]);
        const sourceContainer = buildSourceContainer(sourceRoot);
        context.ext.testResultProvider.events.testSuiteChanged.event.mock.calls[0][0]({
          type: 'result-match-failed',
          file: '/ws-1/a.test.ts',
          sourceContainer,
        });
        expect(wsRoot.item.children.size).toBe(1);
        let docItem = getChildItem(wsRoot.item, 'a.test.ts');
        expect(docItem.children.size).toEqual(2);

        // now call discovery with additional files
        context.ext.testResultProvider.getTestList.mockReturnValueOnce([
          '/ws-1/a.test.ts',
          '/ws-1/b.test.ts',
        ]);
        const jestRun = createTestRun();
        wsRoot.discoverTest(jestRun);
        expect(wsRoot.item.children.size).toBe(2);
        // a.test.ts should still have 2 children
        docItem = getChildItem(wsRoot.item, 'a.test.ts');
        expect(docItem.children.size).toEqual(2);

        // while b.test.ts has none
        docItem = getChildItem(wsRoot.item, 'b.test.ts');
        expect(docItem.children.size).toEqual(0);
      });
    });
    describe('TestDocumentRoot', () => {
      it('will discover all tests within the file', () => {
        const a1 = helper.makeAssertion('test-1', 'KnownSuccess', [], [1, 0]);
        const assertionContainer = buildAssertionContainer([a1]);
        const uri: any = { fsPath: '/ws-1/a.test.ts' };
        context.ext.testResultProvider.getTestSuiteResult.mockReturnValue({
          status: 'KnownSuccess',
          assertionContainer,
        });
        const parentItem: any = controllerMock.createTestItem('ws-1', 'ws-1', uri);
        const docRoot = new TestDocumentRoot(context, uri, parentItem);
        const jestRun = createTestRun();
        docRoot.discoverTest(jestRun);
        expect(docRoot.item.children.size).toEqual(1);
        const tData = context.getData(getChildItem(docRoot.item, 'test-1'));
        expect(tData instanceof TestData).toBeTruthy();
        expect(jestRun.passed).toHaveBeenCalledWith(tData.item);
      });
      it('if no test suite result yet, children list is empty', () => {
        context.ext.testResultProvider.getTestSuiteResult.mockReturnValue(undefined);
        const uri: any = { fsPath: '/ws-1/a.test.ts' };
        const parentItem: any = controllerMock.createTestItem('ws-1', 'ws-1', uri);
        const docRoot = new TestDocumentRoot(context, uri, parentItem);
        const jestRun = createTestRun();
        docRoot.discoverTest(jestRun);
        expect(docRoot.item.children.size).toEqual(0);
      });
    });
    it('FolderData do not support discoverTest', () => {
      const parentItem: any = controllerMock.createTestItem('parent', 'parent', {});
      const folder = new FolderData(context, 'whatever', parentItem);
      expect(folder.item.canResolveChildren).toBe(false);
      expect((folder as any).discoverTest).toBeUndefined();
    });
    it('TestData do not support discoverTest', () => {
      const parentItem: any = controllerMock.createTestItem('parent', 'parent', {});
      const node: any = { fullName: 'a test', attrs: {}, data: {} };

      const test = new TestData(context, { fsPath: 'whatever' } as any, node, parentItem);
      expect(test.item.canResolveChildren).toBe(false);
      expect((test as any).discoverTest).toBeUndefined();
    });
  });
  describe('when TestExplorer triggered runTest', () => {
    describe('Each item data can schedule a test run within the session', () => {
      let process: any;
      beforeEach(() => {
        process = mockScheduleProcess(context);
      });
      describe('run request', () => {
        it('WorkspaceRoot runs all tests in the workspace with non-blocking flag', () => {
          const wsRoot = new WorkspaceRoot(context);
          const jestRun = createTestRun();
          wsRoot.scheduleTest(jestRun);
          const r = context.ext.session.scheduleProcess.mock.calls[0][0];
          expect(r.type).toEqual('all-tests');
          expect(r.nonBlocking).toEqual(true);
        });
        it('FolderData runs all tests inside the folder', () => {
          const parent: any = controllerMock.createTestItem('ws-1', 'ws-1', { fsPath: '/ws-1' });
          const folderData = new FolderData(context, 'folder', parent);
          const jestRun = createTestRun();
          folderData.scheduleTest(jestRun);
          expect(context.ext.session.scheduleProcess).toHaveBeenCalledWith(
            expect.objectContaining({
              type: 'by-file-pattern',
              testFileNamePattern: '/ws-1/folder',
            }),
            expect.anything()
          );
        });
        it('DocumentRoot runs all tests in the test file', () => {
          const parent: any = controllerMock.createTestItem('ws-1', 'ws-1', { fsPath: '/ws-1' });
          const docRoot = new TestDocumentRoot(
            context,
            { fsPath: '/ws-1/a.test.ts' } as any,
            parent
          );
          const jestRun = createTestRun();
          docRoot.scheduleTest(jestRun);
          expect(context.ext.session.scheduleProcess).toHaveBeenCalledWith(
            expect.objectContaining({
              type: 'by-file-pattern',
              testFileNamePattern: '/ws-1/a.test.ts',
            }),
            expect.anything()
          );
        });
        describe('testNamePattern differ between describe and test', () => {
          it.each`
            isDescribeBlock | exactMatch
            ${true}         | ${false}
            ${false}        | ${true}
          `(
            'isDescribeBlock=$isDescribeBlock, exactMatch=$exactMatch',
            ({ isDescribeBlock, exactMatch }) => {
              const uri: any = { fsPath: '/ws-1/a.test.ts' };

              const node: any = isDescribeBlock
                ? {
                    fullName: 'a test',
                    attrs: {},
                    childContainers: [],
                    childData: [],
                  }
                : { fullName: 'a test', attrs: {}, data: {} };

              const parent: any = controllerMock.createTestItem('ws-1', 'ws-1', uri);
              const tData = new TestData(context, uri, node, parent);
              const jestRun = createTestRun();
              tData.scheduleTest(jestRun);
              expect(context.ext.session.scheduleProcess).toHaveBeenCalledWith(
                expect.objectContaining({
                  type: 'by-file-test-pattern',
                  testFileNamePattern: uri.fsPath,
                  testNamePattern: { value: 'a test', exactMatch },
                }),
                expect.anything()
              );
            }
          );
        });
      });
      it('reports error if failed to schedule test', () => {
        context.ext.session.scheduleProcess.mockReturnValue(undefined);
        const parent: any = controllerMock.createTestItem('ws-1', 'ws-1', { fsPath: '/ws-1' });
        const docRoot = new TestDocumentRoot(context, { fsPath: '/ws-1/a.test.ts' } as any, parent);
        const jestRun = createTestRun();
        expect(docRoot.scheduleTest(jestRun)).toBeUndefined();
        expect(jestRun.errored).toHaveBeenCalledWith(docRoot.item, expect.anything());
        expect(jestRun.end).toHaveBeenCalled();
      });
      it('schedule request will contain jestTestRun', () => {
        const parent: any = controllerMock.createTestItem('ws-1', 'ws-1', { fsPath: '/ws-1' });
        const folderData = new FolderData(context, 'folder', parent);
        const jestRun = createTestRun();
        folderData.scheduleTest(jestRun);

        expect(process.userData.run).toBe(jestRun);
        expect(process.userData.testItem).toBe(folderData.item);
      });
      describe('if test name is not resolved', () => {
        it('will find the parent block that is resolved to execute instead', () => {
          const { doc } = createAllTestItems();
          const descNode: any = {
            fullName: 'a $describe',
            attrs: { nonLiteralName: true },
            childContainers: [],
            childData: [],
          };
          const testNode: any = { fullName: 'a test', attrs: { isGroup: 'yes' }, data: {} };
          const descItem = new TestData(context, doc.uri, descNode, doc.item);
          const testItem = new TestData(context, doc.uri, testNode, descItem.item);
          const jestRun = createTestRun();

          testItem.scheduleTest(jestRun);

          expect(process.userData.run).toBe(jestRun);
          expect(process.userData.testItem.id).toBe(doc.item.id);

          expect(jestRun.end).toHaveBeenCalledTimes(2);
          expect(jestRun.updateRequest).toHaveBeenCalledTimes(2);
          expect(vscode.TestRunRequest).toHaveBeenLastCalledWith([doc.item]);
        });
        it('if failed to get parent block, will attempt to run the test anyway', () => {
          const { doc } = createAllTestItems();

          const testNode: any = { fullName: 'a $test', attrs: { nonLiteralName: true }, data: {} };
          const testItem = new TestData(context, doc.uri, testNode, doc.item);
          const jestRun = createTestRun();

          // simulate no parent block
          context.getData = jest.fn().mockReturnValueOnce(undefined);

          testItem.scheduleTest(jestRun);
          expect(process.userData.run).toBe(jestRun);
          expect(process.userData.testItem.id).toBe(testItem.item.id);
        });
      });
      describe('can update snapshot', () => {
        let wsRoot, folder, doc, testItem;
        beforeEach(() => {
          ({ wsRoot, folder, doc, testItem } = createAllTestItems());
        });
        it('with snapshot profile', () => {
          [wsRoot, folder, doc, testItem].forEach((testItem) => {
            const jestRun = createTestRun();
            testItem.scheduleTest(jestRun, { itemCommand: ItemCommand.updateSnapshot });
            expect(context.ext.session.scheduleProcess).toHaveBeenCalledWith(
              expect.objectContaining({
                updateSnapshot: true,
              }),
              expect.anything()
            );
          });
        });
      });
      describe('can run with coverage', () => {
        let wsRoot, folder, doc, testItem;
        beforeEach(() => {
          ({ wsRoot, folder, doc, testItem } = createAllTestItems());
        });
        it('with coverage profile', () => {
          [wsRoot, folder, doc, testItem].forEach((itemDaa) => {
            const jestRun = createTestRun();
            // test for each test data
            context.ext.session.scheduleProcess.mockClear();
            itemDaa.scheduleTest(jestRun, {
              profile: { kind: vscode.TestRunProfileKind.Coverage },
            });
            expect(context.ext.session.scheduleProcess).toHaveBeenCalledWith(
              expect.objectContaining({
                coverage: true,
              }),
              expect.anything()
            );
          });
        });
      });
    });

    describe('when test result is ready', () => {
      describe('WorkspaceRoot will receive testSuiteChanged event to update item status', () => {
        const file = '/ws-1/a.test.ts';
        let wsRoot, onRunEvent, process;
        beforeEach(() => {
          jest.clearAllMocks();
          context.ext.testResultProvider.getTestList.mockReturnValueOnce([file]);

          // mocking test results
          const a1 = helper.makeAssertion('test-a', 'KnownSuccess', [], [1, 0]);
          const a2 = helper.makeAssertion('test-b', 'KnownFail', [], [10, 0], { line: 13 });
          const assertionContainer = buildAssertionContainer([a1, a2]);
          context.ext.testResultProvider.getTestSuiteResult.mockReturnValue({
            status: 'KnownFail',
            assertionContainer,
          });
          wsRoot = new WorkspaceRoot(context);
          onRunEvent = context.ext.sessionEvents.onRunEvent.event.mock.calls[0][0];
          process = mockScheduleProcess(context);
        });
        it('for extension-managed runs, the run will be closed after processing the result', () => {
          // simulate an external run has been scheduled
          onRunEvent({ type: 'scheduled', process });
          expect(mockedJestTestRun).toHaveBeenCalledTimes(1);

          // triggers testSuiteChanged event listener
          context.ext.testResultProvider.events.testSuiteChanged.event.mock.calls[0][0]({
            type: 'assertions-updated',
            process,
            files: [file],
          });

          // no new run should be created the previous scheduled run should be used to update state
          expect(mockedJestTestRun).toHaveBeenCalledTimes(1);
          const jestRun = mockedJestTestRun.mock.results[0].value;

          const dItem = getChildItem(wsRoot.item, 'a.test.ts');
          expect(dItem.children.size).toBe(2);
          const aItem = getChildItem(dItem, 'test-a');
          expect(jestRun.passed).toHaveBeenCalledWith(aItem);
          expect(jestRun.end).toHaveBeenCalledTimes(1);
        });
        it('for explorer-triggered runs, only the resolve function will be invoked', () => {
          // simulate an internal run has been scheduled
          const jestRun = createTestRun();
          mockedJestTestRun.mockClear();

          wsRoot.scheduleTest(jestRun);

          expect(JestTestRun).not.toHaveBeenCalled();

          onRunEvent({ type: 'scheduled', process });
          expect(JestTestRun).toHaveBeenCalledTimes(0);

          // triggers testSuiteChanged event listener
          context.ext.testResultProvider.events.testSuiteChanged.event.mock.calls[0][0]({
            type: 'assertions-updated',
            process,
            files: [file],
          });

          // no new run should be created the previous scheduled run should be used to update state
          expect(JestTestRun).toHaveBeenCalledTimes(0);

          const dItem = getChildItem(wsRoot.item, 'a.test.ts');
          expect(dItem.children.size).toBe(2);
          const tItem = getChildItem(dItem, 'test-a');
          expect(jestRun.passed).toHaveBeenCalledWith(tItem);
          expect(jestRun.end).toHaveBeenCalled();
        });
      });
    });
  });

  describe('sync test item tree with testFile list', () => {
    describe('works in windows', () => {
      beforeEach(() => {
        mockPathSep('\\');
        context.ext.workspace = { name: 'ws-1', uri: { fsPath: 'c:\\ws-1' } };
        vscode.Uri.joinPath = jest
          .fn()
          .mockImplementation((uri, p) => ({ fsPath: `${uri.fsPath}\\${p}` }));
      });
      afterEach(() => {
        mockPathSep('/');
      });

      it('can create folders testItems', () => {
        const testFiles = [
          'c:\\ws-1\\src\\a.test.ts',
          'c:\\ws-1\\src\\b.test.ts',
          'c:\\ws-1\\src\\app\\app.test.ts',
        ];
        context.ext.testResultProvider.getTestList.mockReturnValue(testFiles);
        const wsRoot = new WorkspaceRoot(context);
        const jestRun = createTestRun();
        wsRoot.discoverTest(jestRun);

        // verify tree structure
        expect(wsRoot.item.children.size).toEqual(1);
        wsRoot.item.children.forEach((child) => {
          expect(child.id).toEqual(expect.stringContaining('src'));
          expect(context.getData(child) instanceof FolderData).toBeTruthy();
          expect(child.children.size).toEqual(3);

          // app.test.ts
          const appItem = getChildItem(child, 'app');
          const aItem = getChildItem(child, 'a.test.ts');
          const bItem = getChildItem(child, 'b.test.ts');

          expect(context.getData(appItem) instanceof FolderData).toBeTruthy();
          expect(appItem.children.size).toEqual(1);
          const appFileItem = getChildItem(appItem, 'app.test.ts');
          expect(context.getData(appFileItem) instanceof TestDocumentRoot).toBeTruthy();
          expect(appFileItem.children.size).toEqual(0);

          [aItem, bItem].forEach((fItem) => {
            expect(context.getData(fItem) instanceof TestDocumentRoot).toBeTruthy();
            expect(fItem.children.size).toEqual(0);
          });
        });
      });
    });
    describe('when testFile list changed', () => {
      let wsRoot;
      let testFiles;
      beforeEach(() => {
        // establish baseline with 3 test files
        testFiles = ['/ws-1/src/a.test.ts', '/ws-1/src/b.test.ts', '/ws-1/src/app/app.test.ts'];
        context.ext.testResultProvider.getTestList.mockReturnValue(testFiles);
        wsRoot = new WorkspaceRoot(context);
        const jestRun = createTestRun();
        wsRoot.discoverTest(jestRun);
      });
      it('add', () => {
        // add 2 new files
        const withNewTestFiles = [...testFiles, '/ws-1/tests/d.test.ts', '/ws-1/src/c.test.ts'];

        // trigger event
        context.ext.testResultProvider.events.testListUpdated.event.mock.calls[0][0](
          withNewTestFiles
        );

        //should see the new files in the tree
        expect(wsRoot.item.children.size).toEqual(2);
        const testsFolder = getChildItem(wsRoot.item, 'tests');
        const d = getChildItem(testsFolder, 'd.test.ts');
        expect(d.id).toEqual(expect.stringContaining('d.test.ts'));
        const srcFolder = getChildItem(wsRoot.item, 'src');
        expect(srcFolder.children.size).toBe(4);
        const c = getChildItem(srcFolder, 'c.test.ts');
        expect(c.id).toEqual(expect.stringContaining('c.test.ts'));
      });
      it('delete', () => {
        // delete app test file
        const withoutAppFiles = [testFiles[0], testFiles[1]];

        // trigger event
        context.ext.testResultProvider.events.testListUpdated.event.mock.calls[0][0](
          withoutAppFiles
        );

        //should see the new files in the tree
        expect(wsRoot.item.children.size).toEqual(1);
        const srcFolder = getChildItem(wsRoot.item, 'src');
        expect(srcFolder.children.size).toBe(2);
        const a = getChildItem(srcFolder, 'a.test.ts');
        expect(a).not.toBeUndefined();
        const b = getChildItem(srcFolder, 'b.test.ts');
        expect(b).not.toBeUndefined();
        const app = getChildItem(srcFolder, 'app');
        expect(app).toBeUndefined();
      });
      it('rename', () => {
        // rename src/a.test.ts to c.test.ts
        const withRenamed = ['/ws-1/c.test.ts', testFiles[1], testFiles[2]];

        // trigger event
        context.ext.testResultProvider.events.testListUpdated.event.mock.calls[0][0](withRenamed);

        //should see the new files in the tree
        expect(wsRoot.item.children.size).toEqual(2);
        const c = getChildItem(wsRoot.item, 'c.test.ts');
        expect(c).not.toBeUndefined();

        const srcFolder = getChildItem(wsRoot.item, 'src');
        expect(srcFolder.children.size).toBe(2);
        const b = getChildItem(srcFolder, 'b.test.ts');
        expect(b).not.toBeUndefined();
        const app = getChildItem(srcFolder, 'app');
        expect(app).not.toBeUndefined();
      });
    });
  });
  describe('syncChildNode', () => {
    let docRoot, a1;
    beforeEach(() => {
      // setup baseline with 1 describe block and 1 test
      const parent: any = controllerMock.createTestItem('ws-1', 'ws-1', { fsPath: '/ws-1' });
      a1 = helper.makeAssertion('test-1', 'KnownSuccess', ['desc-1'], [1, 0]);
      const assertionContainer = buildAssertionContainer([a1]);
      context.ext.testResultProvider.getTestSuiteResult.mockReturnValueOnce({
        status: 'KnownSuccess',
        assertionContainer,
      });
      docRoot = new TestDocumentRoot(context, { fsPath: '/ws-1/a.test.ts' } as any, parent);
      const jestRun = createTestRun();
      docRoot.discoverTest(jestRun);
    });
    it('add', () => {
      // add test-2 under existing desc-1 and a new desc-2/test-3
      const a2 = helper.makeAssertion('test-2', 'KnownFail', ['desc-1'], [5, 0]);
      const a3 = helper.makeAssertion('test-3', 'KnownSuccess', ['desc-2'], [10, 0]);
      const a4 = helper.makeAssertion('test-4', 'KnownTodo', ['desc-2'], [15, 0]);
      const assertionContainer = buildAssertionContainer([a1, a2, a3, a4]);
      context.ext.testResultProvider.getTestSuiteResult.mockReturnValue({
        status: 'KnownFail',
        assertionContainer,
      });
      const jestRun = createTestRun();
      docRoot.discoverTest(jestRun);
      expect(docRoot.item.children.size).toEqual(2);
      expect(jestRun.failed).not.toHaveBeenCalledWith(docRoot.item, expect.anything(), undefined);

      const desc1 = getChildItem(docRoot.item, 'desc-1');
      expect(desc1.children.size).toEqual(2);

      const t1 = getChildItem(desc1, 'desc-1 test-1');
      expect(t1).not.toBeUndefined();
      expect(jestRun.passed).toHaveBeenCalledWith(t1);

      const t2 = getChildItem(desc1, 'desc-1 test-2');
      expect(t2).not.toBeUndefined();
      expect(jestRun.failed).toHaveBeenCalledWith(t2, expect.anything());

      const desc2 = getChildItem(docRoot.item, 'desc-2');
      const t3 = getChildItem(desc2, 'desc-2 test-3');
      expect(t3).not.toBeUndefined();
      expect(jestRun.passed).toHaveBeenCalledWith(t3);

      const t4 = getChildItem(desc2, 'desc-2 test-4');
      expect(t4).not.toBeUndefined();
      expect(jestRun.skipped).toHaveBeenCalledWith(t4);
    });
    it('delete', () => {
      // delete the only test -1
      const assertionContainer = buildAssertionContainer([]);
      context.ext.testResultProvider.getTestSuiteResult.mockReturnValue({
        status: 'Unknown',
        assertionContainer,
      });
      const jestRun = createTestRun();
      docRoot.discoverTest(jestRun);
      expect(docRoot.item.children.size).toEqual(0);
    });
    it('rename', () => {
      const a2 = helper.makeAssertion('test-2', 'KnownFail', [], [1, 0]);
      const assertionContainer = buildAssertionContainer([a2]);
      context.ext.testResultProvider.getTestSuiteResult.mockReturnValue({
        status: 'KnownFail',
        assertionContainer,
      });

      const jestRun = createTestRun();
      docRoot.discoverTest(jestRun);
      expect(docRoot.item.children.size).toEqual(1);
      expect(jestRun.failed).not.toHaveBeenCalledWith(docRoot.item, expect.anything(), undefined);
      const t2 = getChildItem(docRoot.item, 'test-2');
      expect(t2).not.toBeUndefined();
      expect(jestRun.failed).toHaveBeenCalledWith(t2, expect.anything());
    });
    it('with syntax error', () => {
      const assertionContainer = buildAssertionContainer([]);
      context.ext.testResultProvider.getTestSuiteResult.mockReturnValue({
        status: 'KnownFail',
        assertionContainer,
      });
      const jestRun = createTestRun();
      docRoot.discoverTest(jestRun);
      expect(docRoot.item.children.size).toEqual(0);
      expect(jestRun.failed).toHaveBeenCalledWith(docRoot.item, expect.anything());
    });
    describe('duplicate test names', () => {
      const setup = (assertions) => {
        const assertionContainer = buildAssertionContainer(assertions);
        context.ext.testResultProvider.getTestSuiteResult.mockReturnValue({
          status: 'KnownFail',
          assertionContainer,
        });
      };
      it('can still be inserted to test tree with unique ids', () => {
        const a2 = helper.makeAssertion('test-1', 'KnownFail', [], [1, 0]);
        const a3 = helper.makeAssertion('test-1', 'KnownSuccess', [], [1, 0]);
        setup([a2, a3]);
        const jestRun = createTestRun();
        docRoot.discoverTest(jestRun);
        expect(docRoot.item.children.size).toEqual(2);
        expect(jestRun.failed).not.toHaveBeenCalledWith(docRoot.item, expect.anything(), undefined);
        const items = [];
        docRoot.item.children.forEach((item) => items.push(item));
        expect(items[0].id).not.toEqual(items[1].id);
        items.forEach((item) => expect(item.id).toEqual(expect.stringContaining('test-1')));

        expect(jestRun.failed).toHaveBeenCalledTimes(1);
        expect(jestRun.passed).toHaveBeenCalledTimes(1);
      });
      it('can still sync with test results', () => {
        const a2 = helper.makeAssertion('test-1', 'KnownFail', [], [1, 0]);
        const a3 = helper.makeAssertion('test-1', 'KnownSuccess', [], [1, 0]);
        setup([a2, a3]);
        let jestRun = createTestRun();
        docRoot.discoverTest(jestRun);
        expect(jestRun.failed).toHaveBeenCalledTimes(1);
        expect(jestRun.passed).toHaveBeenCalledTimes(1);

        //update a2 status
        a2.status = 'KnownSuccess';
        setup([a2, a3]);
        jestRun = createTestRun();
        docRoot.discoverTest(jestRun);
        expect(jestRun.failed).toHaveBeenCalledTimes(0);
        expect(jestRun.passed).toHaveBeenCalledTimes(2);
      });
    });
  });
  describe('tags', () => {
    let wsRoot, folder, doc, testItem;
    beforeEach(() => {
      ({ wsRoot, folder, doc, testItem } = createAllTestItems());
    });
    it('all TestItem supports run tag', () => {
      [wsRoot, folder, doc, testItem].forEach((itemData) => {
        expect(itemData.item.tags.find((t) => t.id === 'run')).toBeTruthy();
      });
    });
    it('all test items support debug tags', () => {
      [wsRoot, folder, doc, testItem].forEach((itemData) =>
        expect(itemData.item.tags.find((t) => t.id === 'debug')).toBeTruthy()
      );
    });
  });
  describe('getDebugInfo', () => {
    let doc, test, parentItem;
    beforeEach(() => {
      const uri: any = { fsPath: 'whatever' };
      parentItem = controllerMock.createTestItem('ws-1', 'ws-1', uri);
      doc = new TestDocumentRoot(context, uri, parentItem);
      const node: any = { fullName: 'a test', attrs: {}, data: {} };
      test = new TestData(context, uri, node, doc.item);
    });
    it('TestData returns file and test info', () => {
      const debugInfo = test.getDebugInfo();
      expect(debugInfo.testPath).toEqual(test.item.uri.fsPath);
      expect(debugInfo.testName).toEqual({ value: 'a test', exactMatch: true });
      expect(debugInfo.useTestPathPattern).toBeFalsy();
    });
    it('TestDocumentRoot returns only file info', () => {
      const debugInfo = doc.getDebugInfo();
      expect(debugInfo.testPath).toEqual(doc.item.uri.fsPath);
      expect(debugInfo.testNamePattern).toBeUndefined();
      expect(debugInfo.useTestPathPattern).toBeFalsy();
    });
    it('FolderData returns folder path info', () => {
      const folder = new FolderData(context, 'folder', parentItem);
      const debugInfo = folder.getDebugInfo();
      expect(debugInfo.testPath).toEqual(folder.item.uri.fsPath);
      expect(debugInfo.testName).toBeUndefined();
      expect(debugInfo.useTestPathPattern).toBeTruthy();
    });
    it('workspaceRoot returns workspace path info', () => {
      const root = new WorkspaceRoot(context);
      const debugInfo = root.getDebugInfo();
      expect(debugInfo.testPath).toEqual(root.item.uri.fsPath);
      expect(debugInfo.testName).toBeUndefined();
      expect(debugInfo.useTestPathPattern).toBeTruthy();
    });
  });
  describe('WorkspaceRoot', () => {
    describe('listens to jest run events', () => {
      it('register and dispose event listeners', () => {
        const wsRoot = new WorkspaceRoot(context);
        expect(context.ext.sessionEvents.onRunEvent.event).toHaveBeenCalled();
        wsRoot.dispose();
        const listener = context.ext.sessionEvents.onRunEvent.event.mock.results[0].value;
        expect(listener.dispose).toHaveBeenCalled();
      });
      describe('optionally clear terminal on start', () => {
        let env;
        beforeEach(() => {
          env = setupTestEnv();
        });
        it.each`
          type          | clearOutput
          ${'schedule'} | ${false}
          ${'start'}    | ${true}
        `('runEvent $type will clear output ? $clearOutput', ({ type, clearOutput }) => {
          const process = mockScheduleProcess(context);
          env.onRunEvent({ type, process });
          if (clearOutput) {
            expect(outputManager.clearOutputOnRun).toHaveBeenCalled();
          } else {
            expect(outputManager.clearOutputOnRun).not.toHaveBeenCalled();
          }
        });
      });
      describe('handle run event to set item status and show output', () => {
        let env;
        beforeEach(() => {
          env = setupTestEnv();
        });
        describe('explorer-triggered runs', () => {
          let process;
          beforeEach(() => {
            process = mockScheduleProcess(context);
          });
          describe.each`
            itemType
            ${'workspace'}
            ${'folder'}
            ${'testFile'}
            ${'testBlock'}
          `('will use run passed from explorer throughout for $targetItem item', ({ itemType }) => {
            it('item will be enqueued after schedule', () => {
              const item = env.scheduleItem(itemType);
              expect(process.userData.run.enqueued).toHaveBeenCalledWith(item);
              expect(process.userData.testItem).toEqual(item);
            });
            it('item will show started when jest run started', () => {
              const item = env.scheduleItem(itemType);

              mockedJestTestRun.mockClear();

              env.onRunEvent({ type: 'scheduled', process });
              expect(process.userData.run.enqueued).toHaveBeenCalled();

              // starting the process
              env.onRunEvent({ type: 'start', process });
              expect(process.userData.testItem).toBe(item);
              expect(process.userData.run.started).toHaveBeenCalledWith(item);

              //will not create new run
              expect(mockedJestTestRun).not.toHaveBeenCalled();
            });
            it.each`
              case | text      | raw          | newLine      | isError      | outputText | outputOptions
              ${1} | ${'text'} | ${'raw'}     | ${true}      | ${false}     | ${'raw'}   | ${'new-line'}
              ${2} | ${'text'} | ${'raw'}     | ${false}     | ${undefined} | ${'raw'}   | ${undefined}
              ${3} | ${'text'} | ${'raw'}     | ${undefined} | ${undefined} | ${'raw'}   | ${undefined}
              ${4} | ${'text'} | ${'raw'}     | ${true}      | ${true}      | ${'raw'}   | ${'error'}
              ${5} | ${'text'} | ${undefined} | ${true}      | ${true}      | ${'text'}  | ${'error'}
            `(
              'can output process data: case $case',
              ({ text, raw, newLine, isError, outputText, outputOptions }) => {
                env.scheduleItem(itemType);
                mockedJestTestRun.mockClear();

                env.onRunEvent({ type: 'start', process });
                env.onRunEvent({ type: 'data', process, text, raw, newLine, isError });
                // no new run should be created
                expect(mockedJestTestRun).not.toHaveBeenCalled();
                expect(process.userData.run.write).toHaveBeenCalledWith(outputText, outputOptions);
              }
            );
            it.each([
              { type: 'end' },
              { type: 'exit', error: 'something is wrong' },
              { type: 'exit', error: 'something is wrong', code: 127 },
              { type: 'exit', error: 'something is wrong', code: 1 },
            ])("will always close the run for event '%s'", (event) => {
              env.scheduleItem(itemType);
              mockedJestTestRun.mockClear();

              env.onRunEvent({ type: 'start', process });
              expect(mockedJestTestRun).not.toHaveBeenCalled();
              expect(process.userData.run.started).toHaveBeenCalled();

              env.onRunEvent({ ...event, process });
              expect(process.userData.run.end).toHaveBeenCalled();
            });
            it('can report exit error even if run is ended earlier', () => {
              env.scheduleItem(itemType);
              mockedJestTestRun.mockClear();

              env.onRunEvent({ type: 'start', process });
              env.onRunEvent({ type: 'end', process });

              expect(mockedJestTestRun).not.toHaveBeenCalled();
              expect(process.userData.run.end).toHaveBeenCalledTimes(1);

              const error = 'something is wrong';
              env.onRunEvent({ type: 'exit', error, process });

              // no new run need to be created
              expect(mockedJestTestRun).not.toHaveBeenCalled();
              expect(process.userData.run.write).toHaveBeenCalledWith(
                expect.stringContaining(error),
                expect.anything()
              );
              // end will be called again
              expect(process.userData.run.end).toHaveBeenCalledTimes(2);
            });
            it('if process has no testItem, will not do anything', () => {
              env.scheduleItem(itemType);
              mockedJestTestRun.mockClear();

              process.userData.run = createTestRun();
              process.userData.testItem = undefined;
              env.onRunEvent({ type: 'start', process });
              expect(process.userData.run.started).not.toHaveBeenCalled();
            });
          });
        });
        describe('extension-managed runs', () => {
          const file = '/ws-1/tests/a.test.ts';
          beforeEach(() => {
            mockedJestTestRun.mockClear();
          });
          describe.each`
            request                                                                                     | withFile
            ${{ type: 'watch-tests' }}                                                                  | ${false}
            ${{ type: 'watch-all-tests' }}                                                              | ${false}
            ${{ type: 'all-tests' }}                                                                    | ${false}
            ${{ type: 'by-file', testFileName: file }}                                                  | ${true}
            ${{ type: 'by-file', testFileName: 'source.ts', notTestFile: true }}                        | ${false}
            ${{ type: 'by-file-test', testFileName: file, testNamePattern: 'whatever' }}                | ${true}
            ${{ type: 'by-file-pattern', testFileNamePattern: file }}                                   | ${true}
            ${{ type: 'by-file-test-pattern', testFileNamePattern: file, testNamePattern: 'whatever' }} | ${true}
          `('will create a new run and use it throughout: $request', ({ request, withFile }) => {
            it('if only reports assertion-update, everything should still work', () => {
              const process: any = { id: 'whatever', request };
              const item = withFile ? env.testFile : env.wsRoot.item;

              expect(mockedJestTestRun).toHaveBeenCalledTimes(0);

              // triggers testSuiteChanged event listener when process has no run or item info
              context.ext.testResultProvider.events.testSuiteChanged.event.mock.calls[0][0]({
                type: 'assertions-updated',
                process,
                files: [env.file],
              });

              // a run should have been created
              expect(mockedJestTestRun).toHaveBeenCalledTimes(1);
              const jestRun = mockedJestTestRun.mock.results[0].value;

              // and the process.userData should be updated
              expect(process.userData.run).toBe(jestRun);
              expect(process.userData.testItem).toBe(item);

              // will close run afterwards
              expect(jestRun.end).toHaveBeenCalled();
            });
            it('if run starts after schedule: show enqueue then start', () => {
              const process: any = { id: 'whatever', request };
              const item = withFile ? env.testFile : env.wsRoot.item;

              //scheduled
              env.onRunEvent({ type: 'scheduled', process });
              expect(mockedJestTestRun).toHaveBeenCalledTimes(1);
              const jestRun = mockedJestTestRun.mock.results[0].value;
              expect(jestRun.enqueued).toHaveBeenCalledWith(item);
              // the run should be injected to the process.userData
              expect(process.userData.run).toBe(jestRun);

              // followed by starting process
              env.onRunEvent({ type: 'start', process });
              expect(jestRun.started).toHaveBeenCalledWith(item);

              //will create 1 new run
              expect(mockedJestTestRun).toHaveBeenCalledTimes(1);
            });
            it.each`
              case | text      | raw          | newLine      | isError      | outputText | outputOptions
              ${1} | ${'text'} | ${'raw'}     | ${true}      | ${false}     | ${'raw'}   | ${'new-line'}
              ${2} | ${'text'} | ${'raw'}     | ${false}     | ${undefined} | ${'raw'}   | ${undefined}
              ${3} | ${'text'} | ${'raw'}     | ${undefined} | ${undefined} | ${'raw'}   | ${undefined}
              ${4} | ${'text'} | ${'raw'}     | ${true}      | ${true}      | ${'raw'}   | ${'error'}
              ${5} | ${'text'} | ${undefined} | ${true}      | ${true}      | ${'text'}  | ${'error'}
            `(
              'can output process data: case $case',
              ({ text, raw, newLine, isError, outputText, outputOptions }) => {
                const process: any = { id: 'whatever', request };

                env.onRunEvent({ type: 'start', process });
                env.onRunEvent({ type: 'data', process, text, raw, newLine, isError });

                expect(mockedJestTestRun).toHaveBeenCalledTimes(1);
                expect(process.userData.run.write).toHaveBeenCalledWith(outputText, outputOptions);
              }
            );
            it.each([['end'], ['exit']])("close the run on event '%s'", (eventType) => {
              const process = { id: 'whatever', request: { type: 'all-tests' } };
              env.onRunEvent({ type: 'start', process });
              expect(mockedJestTestRun).toHaveBeenCalledTimes(1);
              const jestRun = mockedJestTestRun.mock.results[0].value;
              expect(jestRun.started).toHaveBeenCalled();
              expect(jestRun.end).not.toHaveBeenCalled();

              env.onRunEvent({ type: eventType, process });
              expect(jestRun.end).toHaveBeenCalled();
            });
            it('can report exit error even if run is ended', () => {
              const process: any = { id: 'whatever', request: { type: 'all-tests' } };
              env.onRunEvent({ type: 'start', process });
              env.onRunEvent({ type: 'end', process });

              expect(mockedJestTestRun).toHaveBeenCalledTimes(1);
              const jestRun = mockedJestTestRun.mock.results[0].value;
              expect(jestRun.end).toHaveBeenCalled();

              const error = 'something is wrong';
              env.onRunEvent({ type: 'exit', error, process });

              // no new run need to be created
              expect(mockedJestTestRun).toHaveBeenCalledTimes(1);

              expect(jestRun.write).toHaveBeenCalledWith(error, expect.anything());
              expect(jestRun.errored).toHaveBeenCalled();
              expect(jestRun.end).toHaveBeenCalled();
            });
            it('can report end error', () => {
              const process: any = { id: 'whatever', request: { type: 'all-tests' } };
              env.onRunEvent({ type: 'start', process });
              env.onRunEvent({ type: 'end', process, error: 'whatever' });
              expect(process.userData.run.write).toHaveBeenCalledWith('whatever', 'error');
            });
          });
          describe('on request not supported', () => {
            it.each`
              request
              ${{ type: 'not-test' }}
            `('do nothing for request: $request', ({ request }) => {
              const process = { id: 'whatever', request };

              // starting the process
              env.onRunEvent({ type: 'start', process });
              expect(mockedJestTestRun).not.toHaveBeenCalled();
            });
          });
        });
        it('scheduled and start events will do deep item status update', () => {
          const process = mockScheduleProcess(context);
          const testFileData = context.getData(env.testFile);

          const jestRun = createTestRun();
          testFileData.scheduleTest(jestRun);
          expect(jestRun.enqueued).toHaveBeenCalledTimes(2);
          [env.testFile, env.testBlock].forEach((t) =>
            expect(jestRun.enqueued).toHaveBeenCalledWith(t)
          );

          env.onRunEvent({ type: 'start', process });
          expect(jestRun.started).toHaveBeenCalledTimes(2);
          [env.testFile, env.testBlock].forEach((t) =>
            expect(jestRun.started).toHaveBeenCalledWith(t)
          );
        });
        it('log long-run event', () => {
          const process = mockScheduleProcess(context);

          mockedJestTestRun.mockClear();
          env.onRunEvent({ type: 'long-run', threshold: 60000, process });
          expect(mockedJestTestRun).toHaveBeenCalledTimes(1);
          const jestRun = mockedJestTestRun.mock.results[0].value;

          expect(jestRun.write).toHaveBeenCalledTimes(1);
          expect(jestRun.write).toHaveBeenCalledWith(
            expect.stringContaining('60000'),
            errors.LONG_RUNNING_TESTS
          );
        });
        describe('will catch runtime error and close the run', () => {
          let process, jestRun;
          beforeEach(() => {
            process = mockScheduleProcess(context);
            jestRun = createTestRun();
            process.userData = { run: jestRun, testItem: env.testFile };
          });

          it('when run failed to be created', () => {
            // simulate a runtime error
            jestRun.addProcess = jest.fn(() => {
              throw new Error('forced error');
            });
            // this will not throw error
            env.onRunEvent({ type: 'start', process });

            expect(jestRun.started).toHaveBeenCalledTimes(0);
            expect(jestRun.end).toHaveBeenCalledTimes(0);
            expect(jestRun.write).toHaveBeenCalledTimes(0);
          });
          it('when run is created', () => {
            // simulate a runtime error
            jestRun.started = jest.fn(() => {
              throw new Error('forced error');
            });

            // this will not throw error
            env.onRunEvent({ type: 'start', process });

            expect(jestRun.started).toHaveBeenCalledTimes(1);
            expect(jestRun.end).toHaveBeenCalledTimes(1);
            expect(jestRun.write).toHaveBeenCalledTimes(1);
          });
        });
      });
    });
    describe('createTestItem', () => {
      describe('for a regular workspace folder', () => {
        let workspaceFolder: vscode.WorkspaceFolder;
        let wsRoot: WorkspaceRoot;

        beforeEach(() => {
          workspaceFolder = helper.makeWorkspaceFolder('workspace-1');
          wsRoot = createAllTestItems().wsRoot;
          wsRoot.context.ext.workspace = workspaceFolder;
        });

        it("creates an item using folder's uri", () => {
          const item = wsRoot.createTestItem();
          expect(item.uri).toEqual(workspaceFolder.uri);
        });
      });

      describe('for a virtual workspace folder', () => {
        let virtualWorkspaceFolder: VirtualWorkspaceFolder;
        let wsRoot: WorkspaceRoot;

        beforeEach(() => {
          virtualWorkspaceFolder = new VirtualWorkspaceFolder(
            helper.makeWorkspaceFolder('workspace-1'),
            'virtual-a',
            'packages/a'
          );
          wsRoot = createAllTestItems().wsRoot;
          wsRoot.context.ext.workspace = virtualWorkspaceFolder;
        });

        it("creates an item using virtual folder's effectiveUri", () => {
          const item = wsRoot.createTestItem();
          expect(item.uri).toEqual(virtualWorkspaceFolder.effectiveUri);
        });
      });
    });
  });

  describe('test run management', () => {
    let env;
    beforeEach(() => {
      env = setupTestEnv();
      mockedJestTestRun.mockClear();
      contextCreateTestRunSpy.mockClear();
    });
    describe('for process related events', () => {
      it('one run per process', () => {
        // schedule a test run for a specific testBlock
        const item = env.scheduleItem('testBlock');
        expect(mockedJestTestRun).toHaveBeenCalledTimes(1);
        expect(env.process.userData.testItem).toBe(item);
        expect(env.process.userData.run).not.toBeUndefined();
        const jestRun = env.process.userData.run;

        // reset mocks
        mockedJestTestRun.mockClear();
        contextCreateTestRunSpy.mockClear();

        // go through the full events flow
        // start
        env.onRunEvent({ type: 'start', process: env.process });
        expect(mockedJestTestRun).toHaveBeenCalledTimes(0);
        expect(jestRun.end).toHaveBeenCalledTimes(0);

        // data
        env.onRunEvent({ type: 'data', process: env.process, raw: 'whatever', text: 'whatever' });
        expect(mockedJestTestRun).toHaveBeenCalledTimes(0);
        expect(jestRun.end).toHaveBeenCalledTimes(0);

        //end
        env.onRunEvent({ type: 'end', process: env.process });
        expect(mockedJestTestRun).toHaveBeenCalledTimes(0);
        expect(jestRun.end).toHaveBeenCalledTimes(1);
        const endOption1 = jestRun.end.mock.calls[0][0];
        expect(endOption1).toEqual(
          expect.objectContaining({
            process: env.process,
            delay: expect.anything(),
            reason: expect.anything(),
          })
        );

        // test result updated
        context.ext.testResultProvider.events.testSuiteChanged.event.mock.calls[0][0]({
          type: 'assertions-updated',
          process: env.process,
          files: [env.file],
        });
        expect(mockedJestTestRun).toHaveBeenCalledTimes(0);
        expect(jestRun.end).toHaveBeenCalledTimes(2);
        const endOption2 = jestRun.end.mock.calls[1][0];
        expect(endOption2).toEqual(
          expect.objectContaining({
            process: env.process,
            delay: expect.anything(),
            reason: expect.anything(),
          })
        );
        expect(endOption1.delay).toBeGreaterThan(endOption2.delay);

        // test exit
        env.onRunEvent({ type: 'exit', process: env.process, error: 'some error' });
        expect(mockedJestTestRun).toHaveBeenCalledTimes(0);
        expect(jestRun.end).toHaveBeenCalledTimes(3);
        const endOption3 = jestRun.end.mock.calls[2][0];
        expect(endOption3).toEqual(
          expect.objectContaining({
            process: env.process,
            delay: expect.anything(),
            reason: expect.anything(),
          })
        );
        expect(endOption1.delay).toBeGreaterThan(endOption3.delay);
        expect(endOption2.delay).toBeGreaterThanOrEqual(endOption3.delay);
      });
      it('multiple process can share a run', () => {
        const { testBlock, testFile } = env;
        const jestRun = createTestRun();

        const p1 = mockScheduleProcess(context, 'p1');
        context.getData(testBlock).scheduleTest(jestRun);

        const p2 = mockScheduleProcess(context, 'p2');
        context.getData(testFile).scheduleTest(jestRun);

        expect(JestTestRun).toHaveBeenCalledTimes(1);
        expect(p1.userData.run).toBe(jestRun);
        expect(p2.userData.run).toBe(jestRun);
        expect(p1).not.toEqual(p2);

        env.onRunEvent({ type: 'end', process: p1 });
        env.onRunEvent({ type: 'end', process: p2 });
        expect(JestTestRun).toHaveBeenCalledTimes(1);
        expect(jestRun.end).toHaveBeenCalledTimes(2);
      });
      it('if process has no run but with testItem, will create a new run', () => {
        // schedule a test run for a specific testBlock
        const item = env.scheduleItem('testBlock');
        expect(mockedJestTestRun).toHaveBeenCalledTimes(1);
        expect(env.process.userData.testItem).toBe(item);
        expect(env.process.userData.run).not.toBeUndefined();
        const jestRun = env.process.userData.run;

        // remove run from process.userData
        env.process.userData.run = undefined;

        // start
        env.onRunEvent({ type: 'start', process: env.process });

        // a new run should be created
        expect(mockedJestTestRun).toHaveBeenCalledTimes(2);
        expect(env.process.userData.run).not.toBeUndefined();
        expect(env.process.userData.run).not.toBe(jestRun);
      });
    });
    describe('non-process related event', () => {});
  });

  describe('runItemCommand', () => {
    let wsRoot, folder, doc, testItem;
    beforeEach(() => {
      ({ wsRoot, folder, doc, testItem } = createAllTestItems());
    });
    it('can reveal output', () => {
      wsRoot.runItemCommand(ItemCommand.revealOutput);
      expect(context.ext.output.show).toHaveBeenCalledTimes(1);
    });
    it('can update-snapshot for every TestItemData', () => {
      [wsRoot, folder, doc, testItem].forEach((itemData) => {
        contextCreateTestRunSpy.mockClear();
        context.ext.session.scheduleProcess.mockClear();

        itemData.runItemCommand(ItemCommand.updateSnapshot);
        expect(contextCreateTestRunSpy).toHaveBeenCalledTimes(1);
        expect(context.ext.session.scheduleProcess).toHaveBeenCalledWith(
          expect.objectContaining({ updateSnapshot: true }),
          expect.anything()
        );
      });
    });
    describe('view-snapshot', () => {
      beforeEach(() => {
        context.ext.testResultProvider.previewSnapshot.mockReturnValue(Promise.resolve());
      });
      it.each`
        case          | index | canView
        ${'wsRoot'}   | ${0}  | ${false}
        ${'folder'}   | ${1}  | ${false}
        ${'doc'}      | ${2}  | ${false}
        ${'testItem'} | ${3}  | ${true}
      `('$case supports view-snapshot? $canView', async ({ index, canView }) => {
        testItem.node.attrs = { ...testItem.node.attrs, snapshot: 'external' };
        const data = [wsRoot, folder, doc, testItem][index];
        await data.runItemCommand(ItemCommand.viewSnapshot);
        if (canView) {
          expect(context.ext.testResultProvider.previewSnapshot).toHaveBeenCalled();
        } else {
          expect(context.ext.testResultProvider.previewSnapshot).not.toHaveBeenCalled();
        }
      });
      it.each`
        snapshotAttr  | canView
        ${'inline'}   | ${false}
        ${'external'} | ${true}
        ${undefined}  | ${false}
      `(
        'testItem: snapshot = $snapshotAttr, canView? $canView',
        async ({ snapshotAttr, canView }) => {
          testItem.node.attrs = { ...testItem.node.attrs, snapshot: snapshotAttr };
          await testItem.runItemCommand(ItemCommand.viewSnapshot);
          if (canView) {
            expect(context.ext.testResultProvider.previewSnapshot).toHaveBeenCalled();
          } else {
            expect(context.ext.testResultProvider.previewSnapshot).not.toHaveBeenCalled();
          }
        }
      );
    });
  });
  describe('onAssertionUpdate', () => {
    let folder, doc, desc, testItem, test2;
    beforeEach(() => {
      ({ folder, doc, desc, testItem, test2 } = createTestDataTree());
    });
    describe('when test suite failed without assertions', () => {
      it("all child items should inherit the test suite's status", () => {
        // address https://github.com/jest-community/vscode-jest/issues/1098
        const file = '/ws-1/tests/a.test.ts';
        // context.ext.testResultProvider.getTestList.mockReturnValueOnce([]);
        const runMode = new RunMode({ type: 'watch' });
        context.ext.settings = { runMode };

        // test suite failed and there is no assertions
        const testSuiteResult: any = {
          status: 'KnownFail',
          message: 'test file failed',
        };
        context.ext.testResultProvider.getTestSuiteResult.mockReturnValue(testSuiteResult);

        // doc has 2 children before the test suite event
        expect(doc.item.children.size).toBe(2);

        // triggers testSuiteChanged event listener
        contextCreateTestRunSpy.mockClear();
        mockedJestTestRun.mockClear();

        // mock a non-watch process that is still running
        const process = {
          id: 'whatever',
          request: { type: 'watch-tests' },
        };
        context.ext.testResultProvider.events.testSuiteChanged.event.mock.calls[0][0]({
          type: 'assertions-updated',
          process,
          files: [file],
        });

        // all child items should have been removed
        expect(doc.item.children.size).toBe(0);

        // checking item status update...
        const run = mockedJestTestRun.mock.results[0].value;

        // all child items should be updated regardless before being removed
        expect(run.failed).toHaveBeenCalledTimes(4);
        [doc.item, testItem.item, desc.item, test2.item].forEach((item) => {
          expect(run.failed).toHaveBeenCalledWith(item, expect.anything());
        });

        expect(run.end).toHaveBeenCalledTimes(1);
      });
    });
    it('when no test suite result found, the doc and its child items should be removed without any status update', () => {
      const file = '/ws-1/tests/a.test.ts';
      const runMode = new RunMode({ type: 'watch' });
      context.ext.settings = { runMode };

      // test suite failed and there is no assertions
      context.ext.testResultProvider.getTestSuiteResult.mockReturnValue(undefined);

      // doc has 2 children before the test suite event
      expect(folder.item.children.size).toBe(1);
      expect(doc.item.children.size).toBe(2);

      // triggers testSuiteChanged event listener
      contextCreateTestRunSpy.mockClear();
      mockedJestTestRun.mockClear();

      // mock a non-watch process that is still running
      const process = {
        id: 'whatever',
        request: { type: 'watch-tests' },
      };
      context.ext.testResultProvider.events.testSuiteChanged.event.mock.calls[0][0]({
        type: 'assertions-updated',
        process,
        files: [file],
      });

      // all doc's child items should have been removed but the doc itself would remain
      expect(folder.item.children.size).toBe(1);
      expect(doc.item.children.size).toBe(0);

      // checking item status update...
      const run = mockedJestTestRun.mock.results[0].value;

      // no update should occur
      expect(run.failed).not.toHaveBeenCalled();

      expect(run.end).toHaveBeenCalledTimes(1);
    });
  });
});
