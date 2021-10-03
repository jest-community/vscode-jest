jest.unmock('../../src/test-provider/test-item-data');
jest.unmock('../../src/test-provider/test-provider-context');
jest.unmock('../../src/appGlobals');
jest.unmock('../../src/TestResults/match-node');
jest.unmock('../../src/TestResults/match-by-context');
jest.unmock('../test-helper');
jest.unmock('./test-helper');

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
import { JestTestProviderContext } from '../../src/test-provider/test-provider-context';
import {
  buildAssertionContainer,
  buildSourceContainer,
} from '../../src/TestResults/match-by-context';
import * as path from 'path';
import { mockController, mockExtExplorerContext } from './test-helper';

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
  const process = { id: 'whatever', request: { type: 'all-tests' } };
  context.ext.session.scheduleProcess.mockImplementation((request) => {
    process.request = request;
    return process;
  });
  return process;
};
describe('test-item-data', () => {
  let context;
  let profile;
  let runMock;
  let controllerMock;
  let resolveMock;

  beforeEach(() => {
    controllerMock = mockController();
    context = new JestTestProviderContext(mockExtExplorerContext('ws-1'), controllerMock);
    runMock = context.createTestRun();
    profile = { kind: vscode.TestRunProfileKind.Run };
    resolveMock = jest.fn();

    vscode.Uri.joinPath = jest
      .fn()
      .mockImplementation((uri, p) => ({ fsPath: `${uri.fsPath}/${p}` }));
    vscode.Uri.file = jest.fn().mockImplementation((f) => ({ fsPath: f }));
  });
  describe('discover children', () => {
    describe('WorkspaceRoot', () => {
      it('create test document tree for testFiles list', () => {
        const testFiles = [
          '/ws-1/src/a.test.ts',
          '/ws-1/src/b.test.ts',
          '/ws-1/src/app/app.test.ts',
        ];
        context.ext.testResolveProvider.getTestList.mockReturnValue(testFiles);
        const wsRoot = new WorkspaceRoot(context);
        wsRoot.discoverTest(runMock);

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
      it('if no testFiles yet, should still turn off canResolveChildren', () => {
        context.ext.testResolveProvider.getTestList.mockReturnValue([]);
        const wsRoot = new WorkspaceRoot(context);
        wsRoot.discoverTest(runMock);
        expect(wsRoot.item.children.size).toEqual(0);
        expect(wsRoot.item.canResolveChildren).toBe(false);
      });
      it('will only discover up to the test file level', () => {
        const a1 = helper.makeAssertion('test-1', 'KnownSuccess', [], [1, 0]);
        const assertionContainer = buildAssertionContainer([a1]);
        const testFiles = ['/ws-1/a.test.ts'];
        context.ext.testResolveProvider.getTestList.mockReturnValue(testFiles);
        context.ext.testResolveProvider.getTestSuiteResult.mockReturnValue({
          status: 'KnownSuccess',
          assertionContainer,
        });
        const wsRoot = new WorkspaceRoot(context);
        wsRoot.discoverTest(runMock);
        const docItem = wsRoot.item.children.get(testFiles[0]);
        expect(docItem.children.size).toEqual(0);
      });
      it('will remove folder item if no test file exist any more', () => {
        const a1 = helper.makeAssertion('test-1', 'KnownSuccess', [], [1, 0]);
        const assertionContainer = buildAssertionContainer([a1]);
        const testFiles = ['/ws-1/tests1/a.test.ts', '/ws-1/tests2/b.test.ts'];
        context.ext.testResolveProvider.getTestList.mockReturnValue(testFiles);
        context.ext.testResolveProvider.getTestSuiteResult.mockReturnValue({
          status: 'KnownSuccess',
          assertionContainer,
        });
        const wsRoot = new WorkspaceRoot(context);

        // first discover all test files and build the tree
        wsRoot.discoverTest(runMock);
        expect(wsRoot.item.children.size).toEqual(2);
        let folderItem = wsRoot.item.children.get('/ws-1/tests1');
        let docItem = folderItem.children.get(testFiles[0]);
        expect(docItem).not.toBeUndefined();
        folderItem = wsRoot.item.children.get('/ws-1/tests2');
        docItem = folderItem.children.get(testFiles[1]);
        expect(docItem).not.toBeUndefined();

        // now remove '/ws-1/tests2/b.test.ts' and rediscover
        testFiles.length = 1;
        wsRoot.discoverTest(runMock);
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
          expect(context.ext.testResolveProvider.events.testListUpdated.event).toHaveBeenCalled();
          expect(context.ext.testResolveProvider.events.testSuiteChanged.event).toHaveBeenCalled();
        });
        it('unregister events upon dispose', () => {
          const wsRoot = new WorkspaceRoot(context);

          const listeners = [
            context.ext.testResolveProvider.events.testListUpdated.event.mock.results[0].value,
            context.ext.testResolveProvider.events.testSuiteChanged.event.mock.results[0].value,
            context.ext.sessionEvents.onRunEvent.event.mock.results[0].value,
          ];
          wsRoot.dispose();
          listeners.forEach((l) => expect(l.dispose).toBeCalled());
        });
        describe('when testFile list is changed', () => {
          it('testListUpdated event will be fired', () => {
            const wsRoot = new WorkspaceRoot(context);
            context.ext.testResolveProvider.getTestList.mockReturnValueOnce([]);
            wsRoot.discoverTest(runMock);
            expect(wsRoot.item.children.size).toBe(0);

            // invoke testListUpdated event listener
            context.ext.testResolveProvider.events.testListUpdated.event.mock.calls[0][0]([
              '/ws-1/a.test.ts',
            ]);
            // should have created a new run
            const runMock2 = controllerMock.lastRunMock();
            expect(runMock2).not.toBe(runMock);

            expect(wsRoot.item.children.size).toBe(1);
            const docItem = getChildItem(wsRoot.item, 'a.test.ts');
            expect(docItem).not.toBeUndefined();
            expect(runMock2.end).toBeCalled();
          });
        });
        describe('when testSuiteChanged.assertions-updated event filed', () => {
          it('all item data will be updated accordingly', () => {
            context.ext.testResolveProvider.getTestList.mockReturnValueOnce([]);
            context.ext.settings = { testExplorer: { enabled: true, showInlineError: true } };

            const wsRoot = new WorkspaceRoot(context);
            wsRoot.discoverTest(runMock);

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
            context.ext.testResolveProvider.getTestSuiteResult.mockReturnValue(testSuiteResult);

            // triggers testSuiteChanged event listener
            context.ext.testResolveProvider.events.testSuiteChanged.event.mock.calls[0][0]({
              type: 'assertions-updated',
              process: { id: 'whatever', request: {} },
              files: ['/ws-1/a.test.ts'],
            });
            const runMock2 = controllerMock.lastRunMock();
            expect(wsRoot.item.children.size).toBe(1);
            const docItem = getChildItem(wsRoot.item, 'a.test.ts');
            expect(docItem).not.toBeUndefined();
            expect(runMock2.failed).toHaveBeenCalledWith(docItem, {
              message: testSuiteResult.message,
            });

            expect(docItem.children.size).toEqual(1);
            const tItem = getChildItem(docItem, 'test-a');
            expect(tItem).not.toBeUndefined();
            expect(runMock2.failed).toHaveBeenCalledWith(tItem, { message: a1.message });
            expect(tItem.range).toEqual({ args: [1, 0, 1, 0] });

            expect(runMock2.end).toBeCalled();
          });
        });
        describe('when testSuiteChanged.result-matched event fired', () => {
          it('test data range will be updated accordingly', () => {
            // assertion should be discovered prior
            context.ext.testResolveProvider.getTestList.mockReturnValueOnce(['/ws-1/a.test.ts']);

            const a1 = helper.makeAssertion('test-a', 'KnownFail', ['desc-1'], [1, 0]);
            const assertionContainer = buildAssertionContainer([a1]);
            context.ext.testResolveProvider.getTestSuiteResult.mockReturnValue({
              status: 'KnownFail',
              assertionContainer,
            });

            const wsRoot = new WorkspaceRoot(context);
            wsRoot.discoverTest(runMock);
            expect(context.ext.testResolveProvider.getTestSuiteResult).toHaveBeenCalledTimes(1);

            expect(wsRoot.item.children.size).toBe(1);
            const docItem = getChildItem(wsRoot.item, 'a.test.ts');
            expect(docItem.children.size).toEqual(0);

            // after jest test run, result suite should be updated and test block should be populated
            context.ext.testResolveProvider.events.testSuiteChanged.event.mock.calls[0][0]({
              type: 'assertions-updated',
              process: { id: 'whatever', request: {} },
              files: ['/ws-1/a.test.ts'],
            });
            expect(docItem.children.size).toEqual(1);
            const dItem = getChildItem(docItem, 'desc-1');
            expect(dItem.range).toEqual({ args: [1, 0, 1, 0] });
            const tItem = getChildItem(dItem, 'test-a');
            expect(tItem.range).toEqual({ args: [1, 0, 1, 0] });

            expect(context.ext.testResolveProvider.getTestSuiteResult).toHaveBeenCalled();
            controllerMock.createTestRun.mockClear();
            context.ext.testResolveProvider.getTestSuiteResult.mockClear();

            // after match, the assertion nodes would have updated range
            const descNode = assertionContainer.childContainers[0];
            descNode.attrs.range = {
              start: { line: 1, column: 2 },
              end: { line: 13, column: 4 },
            };
            const testNode = descNode.childData[0];
            testNode.attrs.range = {
              start: { line: 2, column: 2 },
              end: { line: 10, column: 4 },
            };

            // triggers testSuiteChanged event listener
            context.ext.testResolveProvider.events.testSuiteChanged.event.mock.calls[0][0]({
              type: 'result-matched',
              file: '/ws-1/a.test.ts',
            });

            // no run should be created as we are not changing any test item tree
            expect(controllerMock.createTestRun).not.toBeCalled();
            expect(context.ext.testResolveProvider.getTestSuiteResult).not.toHaveBeenCalled();

            // expect the item's range has picked up the updated nodes
            expect(dItem.range).toEqual({
              args: [
                descNode.attrs.range.start.line,
                descNode.attrs.range.start.column,
                descNode.attrs.range.end.line,
                descNode.attrs.range.end.column,
              ],
            });
            expect(tItem.range).toEqual({
              args: [
                testNode.attrs.range.start.line,
                testNode.attrs.range.start.column,
                testNode.attrs.range.end.line,
                testNode.attrs.range.end.column,
              ],
            });
          });
        });
        describe('when testSuiteChanged.test-parsed event filed', () => {
          it('test items will be added based on parsed test files (test blocks)', () => {
            // assertion should be discovered prior
            context.ext.testResolveProvider.getTestList.mockReturnValueOnce(['/ws-1/a.test.ts']);

            const t1 = helper.makeItBlock('test-1', [1, 1, 5, 1]);
            const t2 = helper.makeItBlock('test-2', [6, 1, 7, 1]);
            const sourceRoot = helper.makeRoot([t2, t1]);
            const testContainer = buildSourceContainer(sourceRoot);

            const wsRoot = new WorkspaceRoot(context);
            wsRoot.discoverTest(runMock);
            expect(context.ext.testResolveProvider.getTestSuiteResult).toHaveBeenCalledTimes(1);

            expect(wsRoot.item.children.size).toBe(1);
            const docItem = getChildItem(wsRoot.item, 'a.test.ts');
            expect(docItem.children.size).toEqual(0);
            controllerMock.createTestRun.mockClear();
            context.ext.testResolveProvider.getTestSuiteResult.mockClear();

            context.ext.testResolveProvider.events.testSuiteChanged.event.mock.calls[0][0]({
              type: 'test-parsed',
              file: '/ws-1/a.test.ts',
              testContainer,
            });
            expect(docItem.children.size).toEqual(2);
            let dItem = getChildItem(docItem, 'test-1');
            expect(dItem.range).toEqual({ args: [0, 0, 4, 0] });
            dItem = getChildItem(docItem, 'test-2');
            expect(dItem.range).toEqual({ args: [5, 0, 6, 0] });

            expect(context.ext.testResolveProvider.getTestSuiteResult).not.toHaveBeenCalled();
            expect(controllerMock.createTestRun).not.toBeCalled();
          });
        });
      });
    });
    describe('TestDocumentRoot', () => {
      it('will discover all tests within the file', () => {
        const a1 = helper.makeAssertion('test-1', 'KnownSuccess', [], [1, 0]);
        const assertionContainer = buildAssertionContainer([a1]);
        const uri: any = { fsPath: '/ws-1/a.test.ts' };
        context.ext.testResolveProvider.getTestSuiteResult.mockReturnValue({
          status: 'KnownSuccess',
          assertionContainer,
        });
        const parentItem: any = controllerMock.createTestItem('ws-1', 'ws-1', uri);
        const docRoot = new TestDocumentRoot(context, uri, parentItem);
        docRoot.discoverTest(runMock);
        expect(docRoot.item.children.size).toEqual(1);
        const tData = context.getData(getChildItem(docRoot.item, 'test-1'));
        expect(tData instanceof TestData).toBeTruthy();
        expect(runMock.passed).toBeCalledWith(tData.item);
      });
      it('if no test suite result yet, children list is empty', () => {
        context.ext.testResolveProvider.getTestSuiteResult.mockReturnValue(undefined);
        const uri: any = { fsPath: '/ws-1/a.test.ts' };
        const parentItem: any = controllerMock.createTestItem('ws-1', 'ws-1', uri);
        const docRoot = new TestDocumentRoot(context, uri, parentItem);
        docRoot.discoverTest(runMock);
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
        it('WorkspaceRoot runs all tests in the workspace', () => {
          const wsRoot = new WorkspaceRoot(context);
          wsRoot.scheduleTest(runMock, resolveMock, profile);
          expect(context.ext.session.scheduleProcess).toBeCalledWith(
            expect.objectContaining({ type: 'all-tests' })
          );
        });
        it('FolderData runs all tests inside the folder', () => {
          const parent: any = controllerMock.createTestItem('ws-1', 'ws-1', { fsPath: '/ws-1' });
          const folderData = new FolderData(context, 'folder', parent);
          folderData.scheduleTest(runMock, resolveMock, profile);
          expect(context.ext.session.scheduleProcess).toBeCalledWith(
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
          docRoot.scheduleTest(runMock, resolveMock, profile);
          expect(context.ext.session.scheduleProcess).toBeCalledWith(
            expect.objectContaining({
              type: 'by-file',
              testFileName: '/ws-1/a.test.ts',
            })
          );
        });
        it('TestData runs the specific test pattern', () => {
          const uri: any = { fsPath: '/ws-1/a.test.ts' };
          const node: any = { fullName: 'a test', attrs: {}, data: {} };
          const parent: any = controllerMock.createTestItem('ws-1', 'ws-1', uri);
          const tData = new TestData(context, uri, node, parent);
          tData.scheduleTest(runMock, resolveMock, profile);
          expect(context.ext.session.scheduleProcess).toBeCalledWith(
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
        expect(docRoot.scheduleTest(runMock, resolveMock, profile)).toBeUndefined();
        expect(runMock.errored).toBeCalledWith(docRoot.item, expect.anything());
        expect(resolveMock).toBeCalled();
      });
      it('schedule request will contain itemRun info', () => {
        const parent: any = controllerMock.createTestItem('ws-1', 'ws-1', { fsPath: '/ws-1' });
        const folderData = new FolderData(context, 'folder', parent);
        folderData.scheduleTest(runMock, resolveMock, profile);
        const request = context.ext.session.scheduleProcess.mock.calls[0][0];

        expect(request.itemRun.run).toEqual(runMock);
        expect(request.itemRun.item).toEqual(folderData.item);
      });
    });

    describe('when test result is ready', () => {
      describe('WorkspaceRoot will receive testSuiteChanged event to update item status', () => {
        const file = '/ws-1/a.test.ts';
        let wsRoot;
        beforeEach(() => {
          jest.clearAllMocks();
          context.ext.testResolveProvider.getTestList.mockReturnValueOnce([file]);
          wsRoot = new WorkspaceRoot(context);

          // mocking test results
          const a1 = helper.makeAssertion('test-a', 'KnownSuccess', [], [1, 0]);
          const a2 = helper.makeAssertion('test-b', 'KnownFail', [], [10, 0], { line: 13 });
          const assertionContainer = buildAssertionContainer([a1, a2]);
          context.ext.testResolveProvider.getTestSuiteResult.mockReturnValue({
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
          context.ext.testResolveProvider.events.testSuiteChanged.event.mock.calls[0][0]({
            type: 'assertions-updated',
            process,
            files: [file],
          });

          // no new run should be created the previous scheduled run should be used to update state
          expect(controllerMock.createTestRun).toHaveBeenCalledTimes(1);
          const runMock = controllerMock.lastRunMock();

          const dItem = getChildItem(wsRoot.item, 'a.test.ts');
          expect(dItem.children.size).toBe(2);
          const tItem = getChildItem(dItem, 'test-a');
          expect(runMock.passed).toBeCalledWith(tItem);
          expect(runMock.end).toBeCalledTimes(1);
        });
        it('for exporer-triggered runs, only the resolve function will be invoked', () => {
          // simulate an internal run has been scheduled
          const process = mockScheduleProcess(context);

          const runMock = context.createTestRun();
          const resolve = jest.fn();
          controllerMock.createTestRun.mockClear();

          wsRoot.scheduleTest(runMock, resolve, {});

          expect(controllerMock.createTestRun).not.toHaveBeenCalled();

          const onRunEvent = context.ext.sessionEvents.onRunEvent.event.mock.calls[0][0];
          onRunEvent({ type: 'scheduled', process });
          expect(controllerMock.createTestRun).toHaveBeenCalledTimes(0);

          // triggers testSuiteChanged event listener
          context.ext.testResolveProvider.events.testSuiteChanged.event.mock.calls[0][0]({
            type: 'assertions-updated',
            process,
            files: [file],
          });

          // no new run should be created the previous scheduled run should be used to update state
          expect(controllerMock.createTestRun).toHaveBeenCalledTimes(0);

          const dItem = getChildItem(wsRoot.item, 'a.test.ts');
          expect(dItem.children.size).toBe(2);
          const tItem = getChildItem(dItem, 'test-a');
          expect(runMock.passed).toBeCalledWith(tItem);
          expect(runMock.end).not.toBeCalled();
          expect(resolve).toBeCalled();
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

            wsRoot.scheduleTest(runMock, resolveMock, {});

            // triggers testSuiteChanged event listener
            context.ext.testResolveProvider.events.testSuiteChanged.event.mock.calls[0][0]({
              type: 'assertions-updated',
              process,
              files: [file],
            });

            // no new run should be created the previous scheduled run should be used to update state
            expect(controllerMock.createTestRun).toHaveBeenCalledTimes(0);

            const dItem = getChildItem(wsRoot.item, 'a.test.ts');
            const tItem = getChildItem(dItem, 'test-b');
            expect(runMock.failed).toBeCalledWith(tItem, expect.anything());
            if (hasLocation) {
              expect(vscode.TestMessage).toBeCalled();
            } else {
              expect(vscode.TestMessage).not.toBeCalled();
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
        context.ext.testResolveProvider.getTestList.mockReturnValue(testFiles);
        const wsRoot = new WorkspaceRoot(context);
        wsRoot.discoverTest(runMock);

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
        context.ext.testResolveProvider.getTestList.mockReturnValue(testFiles);
        wsRoot = new WorkspaceRoot(context);
        wsRoot.discoverTest(runMock);
      });
      it('add', () => {
        // add 2 new files
        const withNewTestFiles = [...testFiles, '/ws-1/tests/d.test.ts', '/ws-1/src/c.test.ts'];

        // trigger event
        context.ext.testResolveProvider.events.testListUpdated.event.mock.calls[0][0](
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
        context.ext.testResolveProvider.events.testListUpdated.event.mock.calls[0][0](
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
        context.ext.testResolveProvider.events.testListUpdated.event.mock.calls[0][0](withRenamed);

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
      context.ext.testResolveProvider.getTestSuiteResult.mockReturnValueOnce({
        status: 'KnownSuccess',
        assertionContainer,
      });
      docRoot = new TestDocumentRoot(context, { fsPath: '/ws-1/a.test.ts' } as any, parent);
      docRoot.discoverTest(runMock);
    });
    it('add', () => {
      // add test-2 under existing desc-1 and a new desc-2/test-3
      const a2 = helper.makeAssertion('test-2', 'KnownFail', ['desc-1'], [5, 0]);
      const a3 = helper.makeAssertion('test-3', 'KnownSuccess', ['desc-2'], [10, 0]);
      const a4 = helper.makeAssertion('test-4', 'KnownTodo', ['desc-2'], [15, 0]);
      const assertionContainer = buildAssertionContainer([a1, a2, a3, a4]);
      context.ext.testResolveProvider.getTestSuiteResult.mockReturnValue({
        status: 'KnownFail',
        assertionContainer,
      });
      docRoot.discoverTest(runMock);
      expect(docRoot.item.children.size).toEqual(2);
      expect(runMock.failed).toBeCalledWith(docRoot.item, expect.anything());

      const desc1 = getChildItem(docRoot.item, 'desc-1');
      expect(desc1.children.size).toEqual(2);

      const t1 = getChildItem(desc1, 'desc-1 test-1');
      expect(t1).not.toBeUndefined();
      expect(runMock.passed).toBeCalledWith(t1);

      const t2 = getChildItem(desc1, 'desc-1 test-2');
      expect(t2).not.toBeUndefined();
      expect(runMock.failed).toBeCalledWith(t2, expect.anything());

      const desc2 = getChildItem(docRoot.item, 'desc-2');
      const t3 = getChildItem(desc2, 'desc-2 test-3');
      expect(t3).not.toBeUndefined();
      expect(runMock.passed).toBeCalledWith(t3);

      const t4 = getChildItem(desc2, 'desc-2 test-4');
      expect(t4).not.toBeUndefined();
      expect(runMock.skipped).toBeCalledWith(t4);
    });
    it('delete', () => {
      // delete the only test -1
      const assertionContainer = buildAssertionContainer([]);
      context.ext.testResolveProvider.getTestSuiteResult.mockReturnValueOnce({
        status: 'Unknown',
        assertionContainer,
      });
      docRoot.discoverTest(runMock);
      expect(docRoot.item.children.size).toEqual(0);
    });
    it('rename', () => {
      const a2 = helper.makeAssertion('test-2', 'KnownFail', [], [1, 0]);
      const assertionContainer = buildAssertionContainer([a2]);
      context.ext.testResolveProvider.getTestSuiteResult.mockReturnValue({
        status: 'KnownFail',
        assertionContainer,
      });

      docRoot.discoverTest(runMock);
      expect(docRoot.item.children.size).toEqual(1);
      expect(runMock.failed).toBeCalledWith(docRoot.item, expect.anything());
      const t2 = getChildItem(docRoot.item, 'test-2');
      expect(t2).not.toBeUndefined();
      expect(runMock.failed).toBeCalledWith(t2, expect.anything());
    });
    describe('duplicate test names', () => {
      const setup = (assertions) => {
        runMock.passed.mockClear();
        runMock.failed.mockClear();

        const assertionContainer = buildAssertionContainer(assertions);
        context.ext.testResolveProvider.getTestSuiteResult.mockReturnValue({
          status: 'KnownFail',
          assertionContainer,
        });
      };
      it('can still be inserted to test tree with unique ids', () => {
        const a2 = helper.makeAssertion('test-1', 'KnownFail', [], [1, 0]);
        const a3 = helper.makeAssertion('test-1', 'KnownSuccess', [], [1, 0]);
        setup([a2, a3]);
        docRoot.discoverTest(runMock);
        expect(docRoot.item.children.size).toEqual(2);
        expect(runMock.failed).toBeCalledWith(docRoot.item, expect.anything());
        const items = [];
        docRoot.item.children.forEach((item) => items.push(item));
        expect(items[0].id).not.toEqual(items[1].id);
        items.forEach((item) => expect(item.id).toEqual(expect.stringContaining('test-1')));

        expect(runMock.failed).toBeCalledTimes(2);
        expect(runMock.passed).toBeCalledTimes(1);
      });
      it('can still sync with test results', () => {
        const a2 = helper.makeAssertion('test-1', 'KnownFail', [], [1, 0]);
        const a3 = helper.makeAssertion('test-1', 'KnownSuccess', [], [1, 0]);
        setup([a2, a3]);
        docRoot.discoverTest(runMock);
        expect(runMock.failed).toBeCalledTimes(2);
        expect(runMock.passed).toBeCalledTimes(1);

        //update a2 status
        a2.status = 'KnownSuccess';
        setup([a2, a3]);
        docRoot.discoverTest(runMock);
        expect(runMock.failed).toBeCalledTimes(1);
        expect(runMock.passed).toBeCalledTimes(2);
      });
    });
  });
  describe('canRun', () => {
    it('watch-mode workspace does not support Run profile', () => {
      const wsRoot = new WorkspaceRoot(context);
      const profile: any = { kind: vscode.TestRunProfileKind.Run };

      context.ext.autoRun.isWatch = true;
      expect(wsRoot.canRun(profile)).toBeFalsy();

      context.ext.autoRun.isWatch = false;
      expect(wsRoot.canRun(profile)).toBeTruthy();
    });
    it('only TestData support Debug profile', () => {
      const wsRoot = new WorkspaceRoot(context);
      const profile: any = { kind: vscode.TestRunProfileKind.Debug };
      expect(wsRoot.canRun(profile)).toBeFalsy();

      const parentItem: any = controllerMock.createTestItem('parent', 'parent', {});
      const node: any = { fullName: 'a test', attrs: {}, data: {} };

      const test = new TestData(context, { fsPath: 'whatever' } as any, node, parentItem);
      expect(test.canRun(profile)).toBeTruthy();

      expect(test.getDebugInfo()).toEqual({ fileName: 'whatever', testNamePattern: node.fullName });
    });
    it('any other profile kind is not supported at this point', () => {
      const wsRoot = new WorkspaceRoot(context);
      const profile: any = { kind: vscode.TestRunProfileKind.Coverage };
      expect(wsRoot.canRun(profile)).toBeFalsy();
    });
  });
  describe('WorkspaceRoot listens to jest run events', () => {
    it('register and dispose event listeners', () => {
      const wsRoot = new WorkspaceRoot(context);
      expect(context.ext.sessionEvents.onRunEvent.event).toBeCalled();
      wsRoot.dispose();
      const listener = context.ext.sessionEvents.onRunEvent.event.mock.results[0].value;
      expect(listener.dispose).toBeCalled();
    });
    it('can adapt raw output to terminal output', () => {
      const coloredText = '[2K[1G[1myarn run v1.22.5[22m\n';
      const converted = '[2K[1G[1myarn run v1.22.5[22m\r\n';
      context.appendOutput(coloredText, runMock);
      expect(runMock.appendOutput).toBeCalledWith(expect.stringContaining(converted));
    });
    describe('handle run event to set item status and show output', () => {
      const file = '/ws-1/tests/a.test.ts';
      let wsRoot, folder, testFile, testBlock, onRunEvent;
      beforeEach(() => {
        context.ext.testResolveProvider.getTestList.mockReturnValueOnce([file]);
        wsRoot = new WorkspaceRoot(context);
        onRunEvent = context.ext.sessionEvents.onRunEvent.event.mock.calls[0][0];

        // build out the test item tree
        const a1 = helper.makeAssertion('test-a', 'KnownFail', [], [1, 0], {
          message: 'test error',
        });
        const assertionContainer = buildAssertionContainer([a1]);
        const testSuiteResult: any = {
          status: 'KnownFail',
          message: 'test file failed',
          assertionContainer,
        };
        context.ext.testResolveProvider.getTestSuiteResult.mockReturnValue(testSuiteResult);

        // triggers testSuiteChanged event listener
        context.ext.testResolveProvider.events.testSuiteChanged.event.mock.calls[0][0]({
          type: 'assertions-updated',
          process: { id: 'whatever', request: {} },
          files: [file],
        });

        folder = getChildItem(wsRoot.item, 'tests');
        testFile = getChildItem(folder, 'a.test.ts');
        testBlock = getChildItem(testFile, 'test-a');
      });
      describe('explorer-triggered runs', () => {
        const setup = (type: string) => {
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
          data.scheduleTest(runMock, resolveMock, profile);
          controllerMock.createTestRun.mockClear();

          return item;
        };
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
            const item = setup(itemType);
            expect(process.request.itemRun.run.enqueued).toBeCalledWith(item);
          });
          it('item will show started when jest run started', () => {
            const item = setup(itemType);

            process.request.itemRun.run.enqueued.mockClear();

            // scheduled event has no effect
            onRunEvent({ type: 'scheduled', process });
            expect(process.request.itemRun.run.enqueued).not.toBeCalled();

            // starting the process
            onRunEvent({ type: 'start', process });
            expect(process.request.itemRun.item).toBe(item);
            expect(process.request.itemRun.run.started).toBeCalledWith(item);

            //will not create new run
            expect(controllerMock.createTestRun).not.toBeCalled();
          });
          it.each`
            text      | raw          | newLine      | isError      | outputText | outputNewLine | outputColor
            ${'text'} | ${'raw'}     | ${true}      | ${false}     | ${'raw'}   | ${true}       | ${undefined}
            ${'text'} | ${'raw'}     | ${false}     | ${undefined} | ${'raw'}   | ${false}      | ${undefined}
            ${'text'} | ${'raw'}     | ${undefined} | ${undefined} | ${'raw'}   | ${false}      | ${undefined}
            ${'text'} | ${'raw'}     | ${true}      | ${true}      | ${'raw'}   | ${true}       | ${'red'}
            ${'text'} | ${undefined} | ${true}      | ${true}      | ${'text'}  | ${true}       | ${'red'}
          `(
            'can output process data: $text, $raw, $newLine, $isError',
            ({ text, raw, newLine, isError, outputText, outputNewLine, outputColor }) => {
              setup(itemType);
              const appendOutput = jest.spyOn(context, 'appendOutput');

              onRunEvent({ type: 'start', process });
              onRunEvent({ type: 'data', process, text, raw, newLine, isError });

              expect(controllerMock.createTestRun).not.toBeCalled();
              expect(appendOutput).toBeCalledWith(
                outputText,
                process.request.itemRun.run,
                outputNewLine,
                outputColor
              );
            }
          );
          it.each([['end'], ['exit']])(
            "will only resolve the promise and not close the run for event '%s'",
            (eventType) => {
              setup(itemType);
              onRunEvent({ type: 'start', process });
              expect(controllerMock.createTestRun).not.toBeCalled();
              expect(process.request.itemRun.run.started).toBeCalled();

              onRunEvent({ type: eventType, process });
              expect(process.request.itemRun.run.end).not.toBeCalled();
              expect(resolveMock).toBeCalled();
            }
          );
          it('can report exit error even if run is ended', () => {
            setup(itemType);

            onRunEvent({ type: 'start', process });
            onRunEvent({ type: 'end', process });

            expect(controllerMock.createTestRun).not.toBeCalled();
            expect(process.request.itemRun.run.end).not.toBeCalled();
            expect(resolveMock).toBeCalled();

            const error = 'something is wrong';
            onRunEvent({ type: 'exit', error, process });

            // no new run need to be created
            expect(controllerMock.createTestRun).not.toBeCalled();
            expect(process.request.itemRun.run.appendOutput).toBeCalledWith(
              expect.stringContaining(error)
            );
          });
        });
      });
      describe('extension-managed runs', () => {
        beforeEach(() => {
          controllerMock.createTestRun.mockClear();
        });
        describe.each`
          request                                                   | withFile
          ${{ type: 'watch-tests' }}                                | ${false}
          ${{ type: 'watch-all-tests' }}                            | ${false}
          ${{ type: 'all-tests' }}                                  | ${false}
          ${{ type: 'by-file', testFileName: file }}                | ${true}
          ${{ type: 'by-file-pattern', testFileNamePattern: file }} | ${true}
        `('will create a new run and use it throughout: $request', ({ request, withFile }) => {
          it('if run starts before schedule returns: no enqueue', () => {
            const process = { id: 'whatever', request };
            const item = withFile ? testFile : wsRoot.item;

            // starting the process
            onRunEvent({ type: 'start', process });
            const runMock = controllerMock.lastRunMock();
            expect(runMock.started).toBeCalledWith(item);

            //followed by scheduled
            onRunEvent({ type: 'scheduled', process });
            // run has already started, do nothing,
            expect(runMock.enqueued).not.toBeCalled();

            //will create 1 new run
            expect(controllerMock.createTestRun).toBeCalledTimes(1);
          });
          it('if run starts after schedule: show enqueue then start', () => {
            const process = { id: 'whatever', request };
            const item = withFile ? testFile : wsRoot.item;

            //scheduled
            onRunEvent({ type: 'scheduled', process });
            expect(controllerMock.createTestRun).toBeCalledTimes(1);
            const runMock = controllerMock.lastRunMock();
            expect(runMock.enqueued).toBeCalledWith(item);

            // followed by starting process
            onRunEvent({ type: 'start', process });
            expect(runMock.started).toBeCalledWith(item);

            //will create 1 new run
            expect(controllerMock.createTestRun).toBeCalledTimes(1);
          });
          it.each`
            text      | raw          | newLine      | isError      | outputText | outputNewLine | outputColor
            ${'text'} | ${'raw'}     | ${true}      | ${false}     | ${'raw'}   | ${true}       | ${undefined}
            ${'text'} | ${'raw'}     | ${false}     | ${undefined} | ${'raw'}   | ${false}      | ${undefined}
            ${'text'} | ${'raw'}     | ${undefined} | ${undefined} | ${'raw'}   | ${false}      | ${undefined}
            ${'text'} | ${'raw'}     | ${true}      | ${true}      | ${'raw'}   | ${true}       | ${'red'}
            ${'text'} | ${undefined} | ${true}      | ${true}      | ${'text'}  | ${true}       | ${'red'}
          `(
            'can output process data: ($text, $raw, $newLine, $isError)',
            ({ text, raw, newLine, isError, outputText, outputNewLine, outputColor }) => {
              const process = { id: 'whatever', request };
              const appendOutput = jest.spyOn(context, 'appendOutput');

              onRunEvent({ type: 'start', process });
              onRunEvent({ type: 'data', process, text, raw, newLine, isError });

              expect(controllerMock.createTestRun).toBeCalledTimes(1);
              const runMock = controllerMock.lastRunMock();

              expect(appendOutput).toBeCalledWith(outputText, runMock, outputNewLine, outputColor);
            }
          );
          it.each([['end'], ['exit']])("close the run on event '%s'", (eventType) => {
            const process = { id: 'whatever', request: { type: 'all-tests' } };
            onRunEvent({ type: 'start', process });
            expect(controllerMock.createTestRun).toBeCalledTimes(1);
            const runMock = controllerMock.lastRunMock();
            expect(runMock.started).toBeCalled();
            expect(runMock.end).not.toBeCalled();

            onRunEvent({ type: eventType, process });
            expect(runMock.end).toBeCalled();
          });
          it('can report exit error even if run is ended', () => {
            const appendOutput = jest.spyOn(context, 'appendOutput');
            const process = { id: 'whatever', request: { type: 'all-tests' } };
            onRunEvent({ type: 'start', process });
            onRunEvent({ type: 'end', process });

            expect(controllerMock.createTestRun).toBeCalledTimes(1);
            const runMock = controllerMock.lastRunMock();
            expect(runMock.end).toBeCalled();

            const error = 'something is wrong';
            onRunEvent({ type: 'exit', error, process });

            expect(controllerMock.createTestRun).toBeCalledTimes(2);
            const runMock2 = controllerMock.lastRunMock();

            expect(appendOutput).toBeCalledWith(
              error,
              runMock2,
              expect.anything(),
              expect.anything()
            );
            expect(runMock2.errored).toBeCalled();
            expect(runMock2.end).toBeCalled();
          });
          it('if WorkspaceRoot is disposed before process end, all pending run will be closed', () => {
            const process = { id: 'whatever', request: { type: 'all-tests' } };
            onRunEvent({ type: 'start', process });

            expect(controllerMock.createTestRun).toBeCalledTimes(1);
            const runMock = controllerMock.lastRunMock();

            wsRoot.dispose();
            expect(runMock.end).toBeCalled();
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
            onRunEvent({ type: 'start', process });
            const runMock = controllerMock.lastRunMock();
            expect(runMock.started).not.toBeCalled();

            //will not create any run
            expect(controllerMock.createTestRun).not.toBeCalled();
          });
        });
      });
      it('scheduled and start events will do deep item status update', () => {
        const process = mockScheduleProcess(context);
        const testFileData = context.getData(testFile);

        testFileData.scheduleTest(runMock, resolveMock, profile);
        expect(runMock.enqueued).toBeCalledTimes(2);
        [testFile, testBlock].forEach((t) => expect(runMock.enqueued).toBeCalledWith(t));

        onRunEvent({ type: 'start', process });
        expect(runMock.started).toBeCalledTimes(2);
        [testFile, testBlock].forEach((t) => expect(runMock.started).toBeCalledWith(t));
      });
    });
  });
});
