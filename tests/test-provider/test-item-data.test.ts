jest.unmock('../../src/test-provider/test-item-data');
jest.unmock('../../src/test-provider/test-provider-helper');
jest.unmock('../../src/appGlobals');
jest.unmock('../../src/TestResults/match-node');
jest.unmock('../../src/TestResults/match-by-context');
jest.unmock('../test-helper');
jest.unmock('./test-helper');
jest.unmock('../../src/errors');

import { JestTestRun } from '../../src/test-provider/test-provider-helper';
import { tiContextManager } from '../../src/test-provider/test-item-context-manager';
import { toAbsoluteRootPath } from '../../src/helpers';

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
import { JestTestProviderContext } from '../../src/test-provider/test-provider-helper';
import {
  buildAssertionContainer,
  buildSourceContainer,
} from '../../src/TestResults/match-by-context';
import * as path from 'path';
import { mockController, mockExtExplorerContext } from './test-helper';
import * as errors from '../../src/errors';
import { ItemCommand } from '../../src/test-provider/types';

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

const mockScheduleProcess = (context) => {
  const process: any = { id: 'whatever', request: { type: 'watch-tests' } };
  context.ext.session.scheduleProcess.mockImplementation((request) => {
    process.request = request;
    return process;
  });
  return process;
};

describe('test-item-data', () => {
  let context;
  let jestRun;
  let runEndSpy;
  let controllerMock;
  let runMock;

  const createTestRun = (opt?: any): [any, jest.SpyInstance, any] => {
    const run = context.createTestRun(opt?.request ?? {}, opt);
    const endSpy = jest.spyOn(run, 'end');
    const runMock = controllerMock.lastRunMock();
    return [run, endSpy, runMock];
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

  const setupTestEnv = () => {
    const file = '/ws-1/tests/a.test.ts';
    context.ext.testResultProvider.getTestList.mockReturnValueOnce([file]);
    const wsRoot = new WorkspaceRoot(context);
    const onRunEvent = context.ext.sessionEvents.onRunEvent.event.mock.calls[0][0];

    // build out the test item tree
    prepareTestResult();

    // triggers testSuiteChanged event listener
    context.ext.testResultProvider.events.testSuiteChanged.event.mock.calls[0][0]({
      type: 'assertions-updated',
      process: { id: 'whatever', request: { type: 'watch-tests' } },
      files: [file],
    });

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
      data.scheduleTest(jestRun);
      controllerMock.createTestRun.mockClear();

      return item;
    };

    return { wsRoot, folder, testFile, testBlock, onRunEvent, scheduleItem, file };
  };

  const createAllTestItems = () => {
    const wsRoot = new WorkspaceRoot(context);
    const folder = new FolderData(context, 'dir', wsRoot.item);
    const uri: any = { fsPath: 'whatever' };
    const doc = new TestDocumentRoot(context, uri, folder.item);
    const node: any = { fullName: 'a test', attrs: {}, data: {} };
    const testItem = new TestData(context, uri, node, doc.item);
    return { wsRoot, folder, doc, testItem };
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
    [jestRun, runEndSpy, runMock] = createTestRun();

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
          wsRoot.discoverTest(jestRun);
          expect(wsRoot.item.children.size).toEqual(0);
          expect(wsRoot.item.canResolveChildren).toBe(false);
          expect(runEndSpy).toHaveBeenCalledTimes(1);
        });
        it('will not wipe out existing test items', () => {
          // first time discover 1 file
          context.ext.testResultProvider.getTestList.mockReturnValue(['/ws-1/a.test.ts']);
          const wsRoot = new WorkspaceRoot(context);
          wsRoot.discoverTest(jestRun);
          expect(jestRun.isClosed()).toBeTruthy();
          expect(wsRoot.item.children.size).toEqual(1);
          expect(wsRoot.item.canResolveChildren).toBe(false);
          expect(runEndSpy).toHaveBeenCalledTimes(1);

          // 2nd time if no test-file: testItems will not change
          context.ext.testResultProvider.getTestList.mockReturnValue([]);
          [jestRun, runEndSpy] = createTestRun();
          wsRoot.discoverTest(jestRun);
          expect(jestRun.isClosed()).toBeTruthy();
          expect(wsRoot.item.children.size).toEqual(1);
          expect(wsRoot.item.canResolveChildren).toBe(false);
          expect(runEndSpy).toHaveBeenCalledTimes(1);
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
        [jestRun, runEndSpy] = createTestRun();
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
            wsRoot.discoverTest(jestRun);
            expect(wsRoot.item.children.size).toBe(0);

            // invoke testListUpdated event listener
            context.ext.testResultProvider.events.testListUpdated.event.mock.calls[0][0]([
              '/ws-1/a.test.ts',
            ]);
            // should have created a new run
            const runMock2 = controllerMock.lastRunMock();
            expect(runMock2).not.toBe(jestRun.vscodeRun);

            expect(wsRoot.item.children.size).toBe(1);
            const docItem = getChildItem(wsRoot.item, 'a.test.ts');
            expect(docItem).not.toBeUndefined();
            expect(runMock2.end).toHaveBeenCalled();
          });
        });
        describe('when testSuiteChanged.assertions-updated event filed', () => {
          it('all item data will be updated accordingly', () => {
            context.ext.testResultProvider.getTestList.mockReturnValueOnce([]);
            context.ext.settings = {
              testExplorer: { enabled: true, showInlineError: true },
              autoRun: {},
            };

            const wsRoot = new WorkspaceRoot(context);
            wsRoot.discoverTest(jestRun);

            expect(wsRoot.item.children.size).toBe(0);

            // assertions are available now
            const a1 = helper.makeAssertion('test-a', 'KnownFail', [], [1, 0], {
              message: 'test error',
            });
            const assertionContainer = buildAssertionContainer([a1]);
            const testSuiteResult: any = {
              status: 'KnownFail',
              message: 'test file failed',
              assertionContainer,
            };
            context.ext.testResultProvider.getTestSuiteResult.mockReturnValue(testSuiteResult);

            // triggers testSuiteChanged event listener
            context.ext.testResultProvider.events.testSuiteChanged.event.mock.calls[0][0]({
              type: 'assertions-updated',
              process: { id: 'whatever', request: { type: 'watch-tests' } },
              files: ['/ws-1/a.test.ts'],
            });
            const runMock2 = controllerMock.lastRunMock();
            expect(runMock2).not.toBe(runMock);
            expect(wsRoot.item.children.size).toBe(1);
            const docItem = getChildItem(wsRoot.item, 'a.test.ts');
            expect(docItem).not.toBeUndefined();
            expect(runMock2.failed).not.toHaveBeenCalledWith(
              docItem,
              {
                message: testSuiteResult.message,
              },
              undefined
            );

            expect(docItem.children.size).toEqual(1);
            const tItem = getChildItem(docItem, 'test-a');
            expect(tItem).not.toBeUndefined();
            expect(runMock2.failed).toHaveBeenCalledWith(tItem, { message: a1.message }, undefined);
            expect(tItem.range).toEqual({ args: [1, 0, 1, 0] });

            expect(runMock2.end).toHaveBeenCalled();
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
            controllerMock.createTestRun.mockClear();
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
            expect(controllerMock.createTestRun).not.toHaveBeenCalled();
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
            wsRoot.discoverTest(jestRun);
            expect(context.ext.testResultProvider.getTestSuiteResult).toHaveBeenCalledTimes(1);

            expect(wsRoot.item.children.size).toBe(1);
            const docItem = getChildItem(wsRoot.item, 'a.test.ts');
            expect(docItem.children.size).toEqual(0);
            controllerMock.createTestRun.mockClear();
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
            expect(controllerMock.createTestRun).not.toHaveBeenCalled();

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
        docRoot.discoverTest(jestRun);
        expect(docRoot.item.children.size).toEqual(1);
        const tData = context.getData(getChildItem(docRoot.item, 'test-1'));
        expect(tData instanceof TestData).toBeTruthy();
        expect(runMock.passed).toHaveBeenCalledWith(tData.item, undefined);
      });
      it('if no test suite result yet, children list is empty', () => {
        context.ext.testResultProvider.getTestSuiteResult.mockReturnValue(undefined);
        const uri: any = { fsPath: '/ws-1/a.test.ts' };
        const parentItem: any = controllerMock.createTestItem('ws-1', 'ws-1', uri);
        const docRoot = new TestDocumentRoot(context, uri, parentItem);
        docRoot.discoverTest(jestRun);
        expect(docRoot.item.children.size).toEqual(0);
      });
    });
    it('FolderData do not support discoverTest', () => {
      controllerMock.createTestRun.mockClear();
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
      beforeEach(() => {
        context.ext.session.scheduleProcess.mockReturnValue({ id: 'pid' });
      });
      describe('run request', () => {
        it('WorkspaceRoot runs all tests in the workspace in blocking-2 queue', () => {
          const wsRoot = new WorkspaceRoot(context);
          wsRoot.scheduleTest(jestRun);
          const r = context.ext.session.scheduleProcess.mock.calls[0][0];
          expect(r.type).toEqual('all-tests');
          const transformed = r.transform({ schedule: { queue: 'blocking' } });
          expect(transformed.schedule.queue).toEqual('blocking-2');
        });
        it('FolderData runs all tests inside the folder', () => {
          const parent: any = controllerMock.createTestItem('ws-1', 'ws-1', { fsPath: '/ws-1' });
          const folderData = new FolderData(context, 'folder', parent);
          folderData.scheduleTest(jestRun);
          expect(context.ext.session.scheduleProcess).toHaveBeenCalledWith(
            expect.objectContaining({
              type: 'by-file-pattern',
              testFileNamePattern: '/ws-1/folder',
            })
          );
        });
        it('DocumentRoot runs all tests in the test file', () => {
          const parent: any = controllerMock.createTestItem('ws-1', 'ws-1', { fsPath: '/ws-1' });
          const docRoot = new TestDocumentRoot(
            context,
            { fsPath: '/ws-1/a.test.ts' } as any,
            parent
          );
          docRoot.scheduleTest(jestRun);
          expect(context.ext.session.scheduleProcess).toHaveBeenCalledWith(
            expect.objectContaining({
              type: 'by-file-pattern',
              testFileNamePattern: '/ws-1/a.test.ts',
            })
          );
        });
        it('TestData runs the specific test pattern', () => {
          const uri: any = { fsPath: '/ws-1/a.test.ts' };
          const node: any = { fullName: 'a test', attrs: {}, data: {} };
          const parent: any = controllerMock.createTestItem('ws-1', 'ws-1', uri);
          const tData = new TestData(context, uri, node, parent);
          tData.scheduleTest(jestRun);
          expect(context.ext.session.scheduleProcess).toHaveBeenCalledWith(
            expect.objectContaining({
              type: 'by-file-test-pattern',
              testFileNamePattern: uri.fsPath,
              testNamePattern: 'a test',
            })
          );
        });
      });
      it('reports error if failed to schedule test', () => {
        context.ext.session.scheduleProcess.mockReturnValue(undefined);
        const parent: any = controllerMock.createTestItem('ws-1', 'ws-1', { fsPath: '/ws-1' });
        const docRoot = new TestDocumentRoot(context, { fsPath: '/ws-1/a.test.ts' } as any, parent);
        expect(docRoot.scheduleTest(jestRun)).toBeUndefined();
        expect(runMock.errored).toHaveBeenCalledWith(docRoot.item, expect.anything(), undefined);
        expect(runMock.end).toHaveBeenCalled();
        expect(jestRun.isClosed()).toBeTruthy();
      });
      it('schedule request will contain itemRun info', () => {
        const parent: any = controllerMock.createTestItem('ws-1', 'ws-1', { fsPath: '/ws-1' });
        const folderData = new FolderData(context, 'folder', parent);
        folderData.scheduleTest(jestRun);
        const request = context.ext.session.scheduleProcess.mock.calls[0][0];

        expect(request.run).toBe(jestRun);
        expect(request.run.item).toBe(folderData.item);
      });
      it('if test name is not resolved, it will execute the resolved parent test block', () => {
        const { doc } = createAllTestItems();
        const descNode: any = {
          fullName: 'a $describe',
          attrs: { nonLiteralName: true },
          data: {},
        };
        const testNode: any = { fullName: 'a test', attrs: { isGroup: 'yes' }, data: {} };
        const descItem = new TestData(context, doc.uri, descNode, doc.item);
        const testItem = new TestData(context, doc.uri, testNode, descItem.item);

        testItem.scheduleTest(jestRun);
        const request = context.ext.session.scheduleProcess.mock.calls[0][0];
        expect(request.run).toBe(jestRun);
        expect(request.run.item.id).toBe(doc.item.id);
        // try
      });
      describe('can update snapshot based on runProfile', () => {
        let wsRoot, folder, doc, testItem;
        beforeEach(() => {
          ({ wsRoot, folder, doc, testItem } = createAllTestItems());
        });
        it('with snapshot profile', () => {
          [wsRoot, folder, doc, testItem].forEach((testItem) => {
            testItem.scheduleTest(jestRun, ItemCommand.updateSnapshot);
            expect(context.ext.session.scheduleProcess).toHaveBeenCalledWith(
              expect.objectContaining({
                updateSnapshot: true,
              })
            );
          });
        });
      });
    });

    describe('when test result is ready', () => {
      describe('WorkspaceRoot will receive testSuiteChanged event to update item status', () => {
        const file = '/ws-1/a.test.ts';
        let wsRoot;
        beforeEach(() => {
          jest.clearAllMocks();
          context.ext.testResultProvider.getTestList.mockReturnValueOnce([file]);
          wsRoot = new WorkspaceRoot(context);

          // mocking test results
          const a1 = helper.makeAssertion('test-a', 'KnownSuccess', [], [1, 0]);
          const a2 = helper.makeAssertion('test-b', 'KnownFail', [], [10, 0], { line: 13 });
          const assertionContainer = buildAssertionContainer([a1, a2]);
          context.ext.testResultProvider.getTestSuiteResult.mockReturnValue({
            status: 'KnownFail',
            assertionContainer,
          });
          controllerMock.createTestRun.mockClear();
        });
        it('for extension-managed runs, the run will be closed after processing the result', () => {
          // simulate an external run has been scheduled
          const process = { id: 'whatever', request: { type: 'all-tests' } };
          const onRunEvent = context.ext.sessionEvents.onRunEvent.event.mock.calls[0][0];
          onRunEvent({ type: 'scheduled', process });
          expect(controllerMock.createTestRun).toHaveBeenCalledTimes(1);

          // triggers testSuiteChanged event listener
          context.ext.testResultProvider.events.testSuiteChanged.event.mock.calls[0][0]({
            type: 'assertions-updated',
            process,
            files: [file],
          });

          // no new run should be created the previous scheduled run should be used to update state
          expect(controllerMock.createTestRun).toHaveBeenCalledTimes(1);
          const runMock = controllerMock.lastRunMock();

          const dItem = getChildItem(wsRoot.item, 'a.test.ts');
          expect(dItem.children.size).toBe(2);
          const aItem = getChildItem(dItem, 'test-a');
          expect(runMock.passed).toHaveBeenCalledWith(aItem, undefined);
          expect(runMock.end).toHaveBeenCalledTimes(1);
        });
        it('for exporer-triggered runs, only the resolve function will be invoked', () => {
          // simulate an internal run has been scheduled
          const process = mockScheduleProcess(context);

          const customEnd = jest.fn();
          [jestRun, runEndSpy, runMock] = createTestRun({ end: customEnd });
          controllerMock.createTestRun.mockClear();

          wsRoot.scheduleTest(jestRun);

          expect(controllerMock.createTestRun).not.toHaveBeenCalled();

          const onRunEvent = context.ext.sessionEvents.onRunEvent.event.mock.calls[0][0];
          onRunEvent({ type: 'scheduled', process });
          expect(controllerMock.createTestRun).toHaveBeenCalledTimes(0);

          // triggers testSuiteChanged event listener
          context.ext.testResultProvider.events.testSuiteChanged.event.mock.calls[0][0]({
            type: 'assertions-updated',
            process,
            files: [file],
          });

          // no new run should be created the previous scheduled run should be used to update state
          expect(controllerMock.createTestRun).toHaveBeenCalledTimes(0);

          const dItem = getChildItem(wsRoot.item, 'a.test.ts');
          expect(dItem.children.size).toBe(2);
          const tItem = getChildItem(dItem, 'test-a');
          expect(runMock.passed).toHaveBeenCalledWith(tItem, undefined);
          expect(runMock.end).not.toHaveBeenCalled();
          expect(runEndSpy).toHaveBeenCalled();
        });
        it.each`
          config                                       | hasLocation
          ${{ enabled: false }}                        | ${false}
          ${{ enabled: true }}                         | ${false}
          ${{ enabled: true, showInlineError: false }} | ${false}
          ${{ enabled: true, showInlineError: true }}  | ${true}
        `(
          'testExplore config $config, will show inline error? $hasLocation',
          ({ config, hasLocation }) => {
            context.ext.settings = { testExplorer: config };
            const process = mockScheduleProcess(context);

            controllerMock.createTestRun.mockClear();

            wsRoot.scheduleTest(jestRun);

            // triggers testSuiteChanged event listener
            context.ext.testResultProvider.events.testSuiteChanged.event.mock.calls[0][0]({
              type: 'assertions-updated',
              process,
              files: [file],
            });

            // no new run should be created the previous scheduled run should be used to update state
            expect(controllerMock.createTestRun).toHaveBeenCalledTimes(0);

            const dItem = getChildItem(wsRoot.item, 'a.test.ts');
            const tItem = getChildItem(dItem, 'test-b');
            if (hasLocation) {
              expect(vscode.TestMessage).toHaveBeenCalled();
              expect(runMock.failed).toHaveBeenCalledWith(
                tItem,
                expect.objectContaining({ location: {} }),
                undefined
              );
            } else {
              expect(vscode.TestMessage).not.toHaveBeenCalled();
              expect(runMock.failed).toHaveBeenCalledWith(tItem, [], undefined);
            }
          }
        );
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
      docRoot.discoverTest(jestRun);
      expect(docRoot.item.children.size).toEqual(2);
      expect(runMock.failed).not.toHaveBeenCalledWith(docRoot.item, expect.anything(), undefined);

      const desc1 = getChildItem(docRoot.item, 'desc-1');
      expect(desc1.children.size).toEqual(2);

      const t1 = getChildItem(desc1, 'desc-1 test-1');
      expect(t1).not.toBeUndefined();
      expect(runMock.passed).toHaveBeenCalledWith(t1, undefined);

      const t2 = getChildItem(desc1, 'desc-1 test-2');
      expect(t2).not.toBeUndefined();
      expect(runMock.failed).toHaveBeenCalledWith(t2, expect.anything(), undefined);

      const desc2 = getChildItem(docRoot.item, 'desc-2');
      const t3 = getChildItem(desc2, 'desc-2 test-3');
      expect(t3).not.toBeUndefined();
      expect(runMock.passed).toHaveBeenCalledWith(t3, undefined);

      const t4 = getChildItem(desc2, 'desc-2 test-4');
      expect(t4).not.toBeUndefined();
      expect(runMock.skipped).toHaveBeenCalledWith(t4);
    });
    it('delete', () => {
      // delete the only test -1
      const assertionContainer = buildAssertionContainer([]);
      context.ext.testResultProvider.getTestSuiteResult.mockReturnValue({
        status: 'Unknown',
        assertionContainer,
      });
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

      docRoot.discoverTest(jestRun);
      expect(docRoot.item.children.size).toEqual(1);
      expect(runMock.failed).not.toHaveBeenCalledWith(docRoot.item, expect.anything(), undefined);
      const t2 = getChildItem(docRoot.item, 'test-2');
      expect(t2).not.toBeUndefined();
      expect(runMock.failed).toHaveBeenCalledWith(t2, expect.anything(), undefined);
    });
    it('with syntax error', () => {
      const assertionContainer = buildAssertionContainer([]);
      context.ext.testResultProvider.getTestSuiteResult.mockReturnValue({
        status: 'KnownFail',
        assertionContainer,
      });
      docRoot.discoverTest(jestRun);
      expect(docRoot.item.children.size).toEqual(0);
      expect(runMock.failed).toHaveBeenCalledWith(docRoot.item, expect.anything(), undefined);
    });
    describe('duplicate test names', () => {
      const setup = (assertions) => {
        runMock.passed.mockClear();
        runMock.failed.mockClear();

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
        docRoot.discoverTest(jestRun);
        expect(docRoot.item.children.size).toEqual(2);
        expect(runMock.failed).not.toHaveBeenCalledWith(docRoot.item, expect.anything(), undefined);
        const items = [];
        docRoot.item.children.forEach((item) => items.push(item));
        expect(items[0].id).not.toEqual(items[1].id);
        items.forEach((item) => expect(item.id).toEqual(expect.stringContaining('test-1')));

        expect(runMock.failed).toHaveBeenCalledTimes(1);
        expect(runMock.passed).toHaveBeenCalledTimes(1);
      });
      it('can still sync with test results', () => {
        const a2 = helper.makeAssertion('test-1', 'KnownFail', [], [1, 0]);
        const a3 = helper.makeAssertion('test-1', 'KnownSuccess', [], [1, 0]);
        setup([a2, a3]);
        docRoot.discoverTest(jestRun);
        expect(runMock.failed).toHaveBeenCalledTimes(1);
        expect(runMock.passed).toHaveBeenCalledTimes(1);

        //update a2 status
        a2.status = 'KnownSuccess';
        setup([a2, a3]);
        docRoot.discoverTest(jestRun);
        expect(runMock.failed).toHaveBeenCalledTimes(0);
        expect(runMock.passed).toHaveBeenCalledTimes(2);
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
    it('only TestData and TestDocument supports debug tags', () => {
      [doc, testItem].forEach((itemData) =>
        expect(itemData.item.tags.find((t) => t.id === 'debug')).toBeTruthy()
      );
      [wsRoot, folder].forEach((itemData) =>
        expect(itemData.item.tags.find((t) => t.id === 'debug')).toBeUndefined()
      );
    });
  });
  describe('getDebugInfo', () => {
    let doc, test;
    beforeEach(() => {
      const uri: any = { fsPath: 'whatever' };
      const parentItem: any = controllerMock.createTestItem('ws-1', 'ws-1', uri);
      doc = new TestDocumentRoot(context, uri, parentItem);
      const node: any = { fullName: 'a test', attrs: {}, data: {} };
      test = new TestData(context, uri, node, doc.item);
    });
    it('TestData returns file and test info', () => {
      const debugInfo = test.getDebugInfo();
      expect(debugInfo.fileName).toEqual(test.item.uri.fsPath);
      expect(debugInfo.testNamePattern).toEqual('a test');
    });
    it('TestDocumentRoot returns only file info', () => {
      const debugInfo = doc.getDebugInfo();
      expect(debugInfo.fileName).toEqual(doc.item.uri.fsPath);
      expect(debugInfo.testNamePattern).toBeUndefined();
    });
  });
  describe('WorkspaceRoot listens to jest run events', () => {
    it('register and dispose event listeners', () => {
      const wsRoot = new WorkspaceRoot(context);
      expect(context.ext.sessionEvents.onRunEvent.event).toHaveBeenCalled();
      wsRoot.dispose();
      const listener = context.ext.sessionEvents.onRunEvent.event.mock.results[0].value;
      expect(listener.dispose).toHaveBeenCalled();
    });
    it('can adapt raw output to terminal output', () => {
      const coloredText = '[2K[1G[1myarn run v1.22.5[22m\n';
      jestRun.write(coloredText);
      expect(jestRun.vscodeRun.appendOutput).toHaveBeenCalledWith(
        expect.stringContaining(coloredText)
      );
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
          [jestRun, runEndSpy, runMock] = createTestRun({ end: jest.fn() });
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
            expect(process.request.run.vscodeRun.enqueued).toHaveBeenCalledWith(item);
          });
          it('item will show started when jest run started', () => {
            const item = env.scheduleItem(itemType);

            process.request.run.vscodeRun.enqueued.mockClear();

            // scheduled event has no effect
            env.onRunEvent({ type: 'scheduled', process });
            expect(process.request.run.vscodeRun.enqueued).not.toHaveBeenCalled();

            // starting the process
            env.onRunEvent({ type: 'start', process });
            expect(process.request.run.item).toBe(item);
            expect(process.request.run.vscodeRun.started).toHaveBeenCalledWith(item);

            //will not create new run
            expect(controllerMock.createTestRun).not.toHaveBeenCalled();
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

              env.onRunEvent({ type: 'start', process });
              env.onRunEvent({ type: 'data', process, text, raw, newLine, isError });

              expect(controllerMock.createTestRun).not.toHaveBeenCalled();
              expect(context.output.write).toHaveBeenCalledWith(outputText, outputOptions);
            }
          );
          it.each([
            { type: 'end' },
            { type: 'exit', error: 'something is wrong' },
            { type: 'exit', error: 'something is wrong', code: 127 },
            { type: 'exit', error: 'something is wrong', code: 1 },
          ])("will only resolve the promise and not close the run for event '%s'", (event) => {
            env.scheduleItem(itemType);
            env.onRunEvent({ type: 'start', process });
            expect(controllerMock.createTestRun).not.toHaveBeenCalled();
            expect(process.request.run.vscodeRun.started).toHaveBeenCalled();

            env.onRunEvent({ ...event, process });
            expect(process.request.run.vscodeRun.end).not.toHaveBeenCalled();

            expect(runEndSpy).toHaveBeenCalled();
          });
          it('can report exit error even if run is ended', () => {
            env.scheduleItem(itemType);

            env.onRunEvent({ type: 'start', process });
            env.onRunEvent({ type: 'end', process });

            expect(controllerMock.createTestRun).not.toHaveBeenCalled();
            expect(process.request.run.vscodeRun.end).not.toHaveBeenCalled();
            expect(runEndSpy).toHaveBeenCalled();

            const error = 'something is wrong';
            env.onRunEvent({ type: 'exit', error, process });

            // no new run need to be created
            expect(controllerMock.createTestRun).not.toHaveBeenCalled();
            expect(process.request.run.vscodeRun.appendOutput).toHaveBeenCalledWith(
              expect.stringContaining(error)
            );
          });
        });
      });
      describe('extension-managed runs', () => {
        const file = '/ws-1/tests/a.test.ts';
        beforeEach(() => {
          controllerMock.createTestRun.mockClear();
        });
        describe.each`
          request                                                              | withFile
          ${{ type: 'watch-tests' }}                                           | ${false}
          ${{ type: 'watch-all-tests' }}                                       | ${false}
          ${{ type: 'all-tests' }}                                             | ${false}
          ${{ type: 'by-file', testFileName: file }}                           | ${true}
          ${{ type: 'by-file', testFileName: 'source.ts', notTestFile: true }} | ${false}
          ${{ type: 'by-file-pattern', testFileNamePattern: file }}            | ${true}
        `('will create a new run and use it throughout: $request', ({ request, withFile }) => {
          it('if run starts before schedule returns: no enqueue', () => {
            const process = { id: 'whatever', request };
            const item = withFile ? env.testFile : env.wsRoot.item;

            // starting the process
            env.onRunEvent({ type: 'start', process });
            const runMock = controllerMock.lastRunMock();
            expect(runMock.started).toHaveBeenCalledWith(item);

            //followed by scheduled
            env.onRunEvent({ type: 'scheduled', process });
            // run has already started, do nothing,
            expect(runMock.enqueued).not.toHaveBeenCalled();

            //will create 1 new run
            expect(controllerMock.createTestRun).toHaveBeenCalledTimes(1);
          });
          it('if run starts after schedule: show enqueue then start', () => {
            const process = { id: 'whatever', request };
            const item = withFile ? env.testFile : env.wsRoot.item;

            //scheduled
            env.onRunEvent({ type: 'scheduled', process });
            expect(controllerMock.createTestRun).toHaveBeenCalledTimes(1);
            const runMock = controllerMock.lastRunMock();
            expect(runMock.enqueued).toHaveBeenCalledWith(item);

            // followed by starting process
            env.onRunEvent({ type: 'start', process });
            expect(runMock.started).toHaveBeenCalledWith(item);

            //will create 1 new run
            expect(controllerMock.createTestRun).toHaveBeenCalledTimes(1);
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
              const process = { id: 'whatever', request };

              env.onRunEvent({ type: 'start', process });
              env.onRunEvent({ type: 'data', process, text, raw, newLine, isError });

              expect(controllerMock.createTestRun).toHaveBeenCalledTimes(1);
              expect(context.output.write).toHaveBeenCalledWith(outputText, outputOptions);
            }
          );
          it.each([['end'], ['exit']])("close the run on event '%s'", (eventType) => {
            const process = { id: 'whatever', request: { type: 'all-tests' } };
            env.onRunEvent({ type: 'start', process });
            expect(controllerMock.createTestRun).toHaveBeenCalledTimes(1);
            const runMock = controllerMock.lastRunMock();
            expect(runMock.started).toHaveBeenCalled();
            expect(runMock.end).not.toHaveBeenCalled();

            env.onRunEvent({ type: eventType, process });
            expect(runMock.end).toHaveBeenCalled();
          });
          it('can report exit error even if run is ended', () => {
            const process = { id: 'whatever', request: { type: 'all-tests' } };
            env.onRunEvent({ type: 'start', process });
            env.onRunEvent({ type: 'end', process });

            expect(controllerMock.createTestRun).toHaveBeenCalledTimes(1);
            const runMock = controllerMock.lastRunMock();
            expect(runMock.end).toHaveBeenCalled();

            const error = 'something is wrong';
            env.onRunEvent({ type: 'exit', error, process });

            expect(controllerMock.createTestRun).toHaveBeenCalledTimes(2);
            const runMock2 = controllerMock.lastRunMock();

            expect(context.output.write).toHaveBeenCalledWith(error, expect.anything());
            expect(runMock2.errored).toHaveBeenCalled();
            expect(runMock2.end).toHaveBeenCalled();
          });
          it('can report end error', () => {
            const process = { id: 'whatever', request: { type: 'all-tests' } };
            env.onRunEvent({ type: 'start', process });
            env.onRunEvent({ type: 'end', process, error: 'whatever' });
            expect(context.output.write).toHaveBeenCalledWith('whatever', 'error');
          });
          it('if WorkspaceRoot is disposed before process end, all pending run will be closed', () => {
            const process = { id: 'whatever', request: { type: 'all-tests' } };
            env.onRunEvent({ type: 'start', process });

            expect(controllerMock.createTestRun).toHaveBeenCalledTimes(1);
            const runMock = controllerMock.lastRunMock();

            env.wsRoot.dispose();
            expect(runMock.end).toHaveBeenCalled();
          });
        });
        describe('request not supported', () => {
          it.each`
            request
            ${{ type: 'not-test' }}
            ${{ type: 'by-file-test', testFileName: file, testNamePattern: 'whatever' }}
            ${{ type: 'by-file-test-pattern', testFileNamePattern: file, testNamePattern: 'whatever' }}
          `('$request', ({ request }) => {
            const process = { id: 'whatever', request };

            // starting the process
            env.onRunEvent({ type: 'start', process });
            const runMock = controllerMock.lastRunMock();
            expect(runMock.started).not.toHaveBeenCalled();

            //will not create any run
            expect(controllerMock.createTestRun).not.toHaveBeenCalled();
          });
        });
      });
      it('scheduled and start events will do deep item status update', () => {
        const process = mockScheduleProcess(context);
        const testFileData = context.getData(env.testFile);

        testFileData.scheduleTest(jestRun);
        expect(jestRun.vscodeRun.enqueued).toHaveBeenCalledTimes(2);
        [env.testFile, env.testBlock].forEach((t) =>
          expect(jestRun.vscodeRun.enqueued).toHaveBeenCalledWith(t)
        );

        env.onRunEvent({ type: 'start', process });
        expect(jestRun.vscodeRun.started).toHaveBeenCalledTimes(2);
        [env.testFile, env.testBlock].forEach((t) =>
          expect(jestRun.vscodeRun.started).toHaveBeenCalledWith(t)
        );
      });
      it('log long-run event', () => {
        const process = mockScheduleProcess(context);

        env.onRunEvent({ type: 'long-run', threshold: 60000, process });
        expect(context.output.write).toHaveBeenCalledTimes(1);
        expect(context.output.write).toHaveBeenCalledWith(
          expect.stringContaining('60000'),
          errors.LONG_RUNNING_TESTS
        );
      });
    });
  });
  describe('simulate complete run flow', () => {
    let env;
    beforeEach(() => {
      env = setupTestEnv();
    });
    describe('testExplorer managed run', () => {
      let pRun, runRequest, notifyProvider, createTestRunSpy;
      beforeEach(() => {
        notifyProvider = jest.fn();
        runRequest = {};
        [pRun] = createTestRun({ request: runRequest });
        jestRun = new JestTestRun(context, pRun, { end: notifyProvider });
        createTestRunSpy = jest.spyOn(context, 'createTestRun');
      });
      it('run explicit test block', () => {
        const process: any = mockScheduleProcess(context);
        const item = env.scheduleItem('testBlock');
        expect(process.request.run).toBe(jestRun);
        expect(process.request.run.vscodeRun.enqueued).toHaveBeenCalledWith(item);
        expect(process.request.run.item).toBe(item);

        //end the process: will not actually end the run but to only notify the provider
        env.onRunEvent({ type: 'end', process });
        expect(process.request.run.isClosed()).toBeFalsy();
        expect(notifyProvider).toHaveBeenCalled();

        //the run ends before results come in, the process's run should reflect it
        pRun.end();
        expect(jestRun.isClosed()).toBeTruthy();
        expect(process.request.run.isClosed()).toBeTruthy();

        // prepare for result processing
        controllerMock.createTestRun.mockClear();
        createTestRunSpy.mockClear();

        // triggers testSuiteChanged event listener
        context.ext.testResultProvider.events.testSuiteChanged.event.mock.calls[0][0]({
          type: 'assertions-updated',
          process,
          files: [env.file],
        });

        // expect the item status to be updated in a new run since the previous one is closed
        expect(controllerMock.createTestRun).toHaveBeenCalledTimes(1);
        expect(controllerMock.createTestRun).toHaveBeenCalledWith(runRequest, expect.anything());
        runMock = controllerMock.lastRunMock();
        expect(runMock.failed).toHaveBeenCalledWith(item, expect.anything(), undefined);
        expect(runMock.failed).not.toHaveBeenCalledWith(env.testFile, expect.anything(), undefined);

        // the new testRun should still have the same item and request
        expect(createTestRunSpy).toHaveBeenCalledTimes(1);
        const aRequest = createTestRunSpy.mock.calls[0][0];
        const option = createTestRunSpy.mock.calls[0][1];
        expect(aRequest).not.toBe(runRequest);
        expect(option.item.id).toEqual(item.id);
      });
      it('run explicit test block will not hang run with or without result', () => {
        const process: any = mockScheduleProcess(context);
        const item = env.scheduleItem('testBlock');
        createTestRunSpy.mockClear();

        expect(process.request.run).toBe(jestRun);
        expect(process.request.run.vscodeRun.enqueued).toHaveBeenCalledWith(item);
        expect(process.request.run.item).toBe(item);

        //end the process: will not actually end the run but to only notify the provider
        env.onRunEvent({ type: 'end', process });
        expect(process.request.run.isClosed()).toBeFalsy();
        expect(notifyProvider).toHaveBeenCalled();

        //the parent run ends before test process completes
        pRun.end();
        expect(jestRun.isClosed()).toBeTruthy();
        expect(process.request.run.isClosed()).toBeTruthy();

        //received more data event: will not create new run
        env.onRunEvent({ type: 'data', process, raw: 'whatever', text: 'whatever' });
        expect(createTestRunSpy).not.toHaveBeenCalled();

        // prepare for result processing
        controllerMock.createTestRun.mockClear();
        createTestRunSpy.mockClear();

        // triggers testSuiteChanged event listener
        context.ext.testResultProvider.events.testSuiteChanged.event.mock.calls[0][0]({
          type: 'assertions-updated',
          process,
          files: [env.file],
        });

        // expect the item status to be updated with a new run
        expect(controllerMock.createTestRun).toHaveBeenCalledTimes(1);
        runMock = controllerMock.lastRunMock();
        // and the run should be closed
        expect(runMock.end).toHaveBeenCalled();
      });
    });
    describe('extension managed autoRun', () => {
      let createTestRunSpy;
      beforeEach(() => {
        createTestRunSpy = jest.spyOn(context, 'createTestRun');
      });
      it('wawtch-test run', () => {
        const request: any = { type: 'watch-tests' };
        const process = { id: 'whatever', request };
        const item = env.wsRoot.item;

        // starting the process
        env.onRunEvent({ type: 'start', process });

        expect(createTestRunSpy).toHaveBeenCalledTimes(1);
        let opt = createTestRunSpy.mock.calls[0][1];
        expect(opt.item.id).toEqual(item.id);

        runMock = controllerMock.lastRunMock();
        expect(runMock.started).toHaveBeenCalledWith(item);
        expect(process.request.run).toBeUndefined();

        createTestRunSpy.mockClear();

        //received output: no new run should be created
        const text = 'some data';
        env.onRunEvent({ type: 'data', process, text, raw: text });
        expect(createTestRunSpy).not.toHaveBeenCalled();
        expect(context.output.write).toHaveBeenCalledWith(text, undefined);

        createTestRunSpy.mockClear();

        //end the run
        env.onRunEvent({ type: 'end', process });
        expect(runMock.end).toHaveBeenCalled();

        // prepare for result processing
        createTestRunSpy.mockClear();

        // process test results
        context.ext.testResultProvider.events.testSuiteChanged.event.mock.calls[0][0]({
          type: 'assertions-updated',
          process,
          files: [env.file],
        });

        // expect the item status to be updated in a new run since the previous one is closed
        expect(createTestRunSpy).toHaveBeenCalledTimes(1);
        opt = createTestRunSpy.mock.calls[0][1];
        expect(opt.item.id).toEqual(item.id);

        runMock = controllerMock.lastRunMock();
        expect(runMock.failed).toHaveBeenCalledWith(env.testBlock, expect.anything(), undefined);
        expect(runMock.failed).not.toHaveBeenCalledWith(env.testFile, expect.anything(), undefined);
      });
    });
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
      const createTestRunSpy = jest.spyOn(context, 'createTestRun');
      [wsRoot, folder, doc, testItem].forEach((itemData) => {
        createTestRunSpy.mockClear();
        context.ext.session.scheduleProcess.mockClear();

        itemData.runItemCommand(ItemCommand.updateSnapshot);
        expect(createTestRunSpy).toHaveBeenCalledTimes(1);
        expect(context.ext.session.scheduleProcess).toHaveBeenCalledWith(
          expect.objectContaining({ updateSnapshot: true })
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
});
