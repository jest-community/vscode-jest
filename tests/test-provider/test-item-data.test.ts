jest.unmock('../../src/test-provider/test-item-data');
jest.unmock('../../src/appGlobals');
jest.unmock('../../src/TestResults/match-node');
jest.unmock('../../src/TestResults/match-by-context');
jest.unmock('../test-helper');

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
import { buildAssertionContainer } from '../../src/TestResults/match-by-context';
import * as path from 'path';

const mockPathSep = (newSep: string) => {
  (path as jest.Mocked<any>).setSep(newSep);
  (path as jest.Mocked<any>).sep = newSep;
};
class TestItemCollectionMock {
  private items: vscode.TestItem[] = [];
  get size(): number {
    return this.items.length;
  }
  replace = (list: vscode.TestItem[]) => {
    this.items = list;
  };
  get = (id: string) => this.items.find((i) => i.id === id);
  add = (item: vscode.TestItem) => {
    this.items.push(item);
  };
  delete = (id: string) => {
    this.items = this.items.filter((i) => i.id !== id);
  };
  forEach = (f: (item: vscode.TestItem) => void) => {
    this.items.forEach(f);
  };
}
const makeTestItem = (id, label, uri, parent?: any) => {
  const item = {
    id,
    label,
    parent,
    uri,
    children: new TestItemCollectionMock(),
    dispose: jest.fn(),
  };
  item.dispose.mockImplementation(() => parent?.children.delete(id));
  parent?.children.add(item);
  return item;
};
let itemMap: Map<object, object>;

const mockContext = () => ({
  loggingFactory: { create: jest.fn().mockReturnValue(jest.fn()) },
  autoRun: { isWatch: true },
  workspace: { name: 'ws-1', uri: { fsPath: '/ws-1' } },
  testResolveProvider: {
    events: {
      testListUpdated: { event: jest.fn().mockReturnValue({ dispose: jest.fn() }) },
      testSuiteChanged: { event: jest.fn().mockReturnValue({ dispose: jest.fn() }) },
    },
    getTestList: jest.fn().mockReturnValue([]),
    isTestFile: jest.fn().mockReturnValue('yes'),
    getTestSuiteResult: jest.fn().mockReturnValue({}),
  },
  session: {
    scheduleProcess: jest.fn(),
  },
  getData: jest.fn().mockImplementation((item) => itemMap.get(item)),
  getChildData: jest.fn().mockImplementation((item, cId) => {
    const cItem = item.children.get(cId);
    return itemMap.get(cItem);
  }),
  createTestItem: jest.fn().mockImplementation((id, label, uri, data, parent) => {
    const item = makeTestItem(id, label, uri, parent);
    itemMap.set(item, data);
    return item;
  }),
  createTestRun: jest.fn(),
  getScheduledTest: jest.fn(),
});

const getChildItem = (item: vscode.TestItem, partialId: string): vscode.TestItem | undefined => {
  let found;
  item.children.forEach((child) => {
    if (!found && child.id.includes(partialId)) {
      found = child;
    }
  });
  return found;
};
const createRun = (request, name) => {
  return {
    request,
    name,
    started: jest.fn(),
    passed: jest.fn(),
    skipped: jest.fn(),
    errored: jest.fn(),
    failed: jest.fn(),
    appendOutput: jest.fn(),
    end: jest.fn(),
  };
};

describe('test-item-data', () => {
  let runMock;
  let context;
  let profile;

  beforeEach(() => {
    runMock = createRun({}, 'runMock');
    itemMap = new Map();
    context = mockContext();
    profile = { kind: vscode.TestRunProfileKind.Run };

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
        context.testResolveProvider.getTestList.mockReturnValue(testFiles);
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

        // will listen to external events
        expect(context.testResolveProvider.events.testListUpdated.event).toBeCalledTimes(1);
        expect(context.testResolveProvider.events.testSuiteChanged.event).toBeCalledTimes(1);

        //verify state after the discovery
        expect(wsRoot.item.canResolveChildren).toBe(false);
      });
      it('if no testFiles yet, should still turn off canResolveChildren', () => {
        context.testResolveProvider.getTestList.mockReturnValue([]);
        const wsRoot = new WorkspaceRoot(context);
        wsRoot.discoverTest(runMock);
        expect(wsRoot.item.children.size).toEqual(0);
        expect(wsRoot.item.canResolveChildren).toBe(false);
      });
      it('will only discover up to the test file level', () => {
        const a1 = helper.makeAssertion('test-1', 'KnownSuccess', [], [1, 0]);
        const assertionContainer = buildAssertionContainer([a1]);
        const testFiles = ['/ws-1/a.test.ts'];
        context.testResolveProvider.getTestList.mockReturnValue(testFiles);
        context.testResolveProvider.getTestSuiteResult.mockReturnValue({
          status: 'KnownSuccess',
          assertionContainer,
        });
        const wsRoot = new WorkspaceRoot(context);
        wsRoot.discoverTest(runMock);
        const docItem = wsRoot.item.children.get(testFiles[0]);
        expect(docItem.children.size).toEqual(0);
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
        describe('when testFile list is changed', () => {
          it('testListUpdated event will be fired', () => {
            const wsRoot = new WorkspaceRoot(context);
            context.testResolveProvider.getTestList.mockReturnValueOnce([]);
            wsRoot.discoverTest(runMock);
            expect(wsRoot.item.children.size).toBe(0);

            // invoke testListUpdated event listener
            let runMock2;
            context.createTestRun.mockImplementation((request, name) => {
              runMock2 = createRun(request, name);
              return runMock2;
            });
            context.testResolveProvider.events.testListUpdated.event.mock.calls[0][0]([
              '/ws-1/a.test.ts',
            ]);
            expect(wsRoot.item.children.size).toBe(1);
            const docItem = getChildItem(wsRoot.item, 'a.test.ts');
            expect(docItem).not.toBeUndefined();
            expect(runMock2.end).toBeCalled();
          });
        });
        describe('when testSuiteChanged.assertions-updated event filed', () => {
          it('all item data will be updated accordingly', () => {
            context.testResolveProvider.getTestList.mockReturnValueOnce([]);

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
            context.testResolveProvider.getTestSuiteResult.mockReturnValue(testSuiteResult);

            let runMock2;
            context.createTestRun.mockImplementationOnce((request, name) => {
              runMock2 = createRun(request, name);
              return runMock2;
            });

            // triggers testSuiteChanged event listener
            context.testResolveProvider.events.testSuiteChanged.event.mock.calls[0][0]({
              type: 'assertions-updated',
              pid: 'whatever',
              files: ['/ws-1/a.test.ts'],
            });
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
            context.testResolveProvider.getTestList.mockReturnValueOnce(['/ws-1/a.test.ts']);

            const a1 = helper.makeAssertion('test-a', 'KnownFail', ['desc-1'], [1, 0]);
            const assertionContainer = buildAssertionContainer([a1]);
            context.testResolveProvider.getTestSuiteResult.mockReturnValue({
              status: 'KnownFail',
              assertionContainer,
            });
            context.createTestRun.mockImplementationOnce((request, name) => {
              return createRun(request, name);
            });

            const wsRoot = new WorkspaceRoot(context);
            wsRoot.discoverTest(runMock);
            expect(context.testResolveProvider.getTestSuiteResult).toHaveBeenCalledTimes(1);

            expect(wsRoot.item.children.size).toBe(1);
            const docItem = getChildItem(wsRoot.item, 'a.test.ts');
            expect(docItem.children.size).toEqual(0);

            // after jest test run, result suite should be updated and test block should be populated
            context.testResolveProvider.events.testSuiteChanged.event.mock.calls[0][0]({
              type: 'assertions-updated',
              pid: 'whatever',
              files: ['/ws-1/a.test.ts'],
            });
            expect(docItem.children.size).toEqual(1);
            const dItem = getChildItem(docItem, 'desc-1');
            expect(dItem.range).toEqual({ args: [1, 0, 1, 0] });
            const tItem = getChildItem(dItem, 'test-a');
            expect(tItem.range).toEqual({ args: [1, 0, 1, 0] });

            expect(context.testResolveProvider.getTestSuiteResult).toHaveBeenCalled();
            context.createTestRun.mockClear();
            context.testResolveProvider.getTestSuiteResult.mockClear();

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
            context.testResolveProvider.events.testSuiteChanged.event.mock.calls[0][0]({
              type: 'result-matched',
              file: '/ws-1/a.test.ts',
            });

            // no run should be created as we are not changing any test item tree
            expect(context.createTestRun).not.toBeCalled();
            expect(context.testResolveProvider.getTestSuiteResult).not.toHaveBeenCalled();

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
      });
    });
    describe('TestDocumentRoot', () => {
      it('will discover all tests within the file', () => {
        const a1 = helper.makeAssertion('test-1', 'KnownSuccess', [], [1, 0]);
        const assertionContainer = buildAssertionContainer([a1]);
        const uri: any = { fsPath: '/ws-1/a.test.ts' };
        context.testResolveProvider.getTestSuiteResult.mockReturnValue({
          status: 'KnownSuccess',
          assertionContainer,
        });
        const parentItem: any = makeTestItem('ws-1', 'ws-1', uri);
        const docRoot = new TestDocumentRoot(context, uri, parentItem);
        docRoot.discoverTest(runMock);
        expect(docRoot.item.children.size).toEqual(1);
        const tData = context.getData(getChildItem(docRoot.item, 'test-1'));
        expect(tData instanceof TestData).toBeTruthy();
        expect(runMock.passed).toBeCalledWith(tData.item);
      });
    });
  });
  describe('when TestExplorer triggered runTest', () => {
    describe('Each item data can schedule a test run within the session', () => {
      beforeEach(() => {
        context.session.scheduleProcess.mockReturnValue('pid');
      });
      it('WorkspaceRoot runs all tests in the workspace', () => {
        const wsRoot = new WorkspaceRoot(context);
        expect(wsRoot.scheduleTest(runMock, profile)).toEqual('pid');
        expect(context.session.scheduleProcess).toBeCalledWith(
          expect.objectContaining({ type: 'all-tests' })
        );
      });
      it('FolderData runs all tests inside the folder', () => {
        const parent: any = makeTestItem('ws-1', 'ws-1', { fsPath: '/ws-1' }, undefined);
        const folderData = new FolderData(context, 'folder', parent);
        expect(folderData.scheduleTest(runMock, profile)).toEqual('pid');
        expect(context.session.scheduleProcess).toBeCalledWith(
          expect.objectContaining({
            type: 'by-file-pattern',
            testFileNamePattern: '/ws-1/folder',
          })
        );
      });
      it('DocumentRoot runs all tests in the test file', () => {
        const parent: any = makeTestItem('ws-1', 'ws-1', { fsPath: '/ws-1' }, undefined);
        const docRoot = new TestDocumentRoot(context, { fsPath: '/ws-1/a.test.ts' } as any, parent);
        expect(docRoot.scheduleTest(runMock, profile)).toEqual('pid');
        expect(context.session.scheduleProcess).toBeCalledWith(
          expect.objectContaining({
            type: 'by-file',
            testFileName: '/ws-1/a.test.ts',
          })
        );
      });
      it('TestData runs the specific test pattern', () => {
        const uri: any = { fsPath: '/ws-1/a.test.ts' };
        const node: any = { fullName: 'a test', attrs: {}, data: {} };
        const parent: any = makeTestItem('ws-1', 'ws-1', uri, undefined);
        const tData = new TestData(context, uri, node, parent);
        expect(tData.scheduleTest(runMock, profile)).toEqual('pid');
        expect(context.session.scheduleProcess).toBeCalledWith(
          expect.objectContaining({
            type: 'by-file-test-pattern',
            testFileNamePattern: uri.fsPath,
            testNamePattern: 'a test',
          })
        );
      });
    });
    describe('when test is completed', () => {
      beforeEach(() => {});
      it('WorkspaceRoot will receive testSuiteChanged event', () => {
        const file = '/ws-1/a.test.ts';
        context.testResolveProvider.getTestList.mockReturnValueOnce([file]);
        const wsRoot = new WorkspaceRoot(context);
        wsRoot.discoverTest(runMock);
        const dItem = getChildItem(wsRoot.item, 'a.test.ts');
        expect(dItem.children.size).toBe(0);
        expect(dItem.canResolveChildren).toBe(true);

        //previous scheduled test can be retrieved via context, mocking the data
        const scheduledTest = { run: createRun({}, 'pid'), onDone: jest.fn(), cancelToken: {} };
        context.getScheduledTest.mockReturnValue(scheduledTest);

        // mocking test results
        const a1 = helper.makeAssertion('test-a', 'KnownSuccess', [], [1, 0]);
        const assertionContainer = buildAssertionContainer([a1]);
        context.testResolveProvider.getTestSuiteResult.mockReturnValue({
          status: 'KnownSuccess',
          assertionContainer,
        });

        // triggers testSuiteChanged event listener
        context.testResolveProvider.events.testSuiteChanged.event.mock.calls[0][0]({
          type: 'assertions-updated',
          pid: 'pid',
          files: [file],
        });

        // the previous scheduled run should be used to update state
        expect(dItem.children.size).toBe(1);
        const tItem = getChildItem(dItem, 'test-a');
        expect(scheduledTest.run.passed).toBeCalledWith(tItem);
        // the complete handler should be invoked
        expect(scheduledTest.onDone).toBeCalled();
      });
    });
  });

  describe('sync test item tree with testFile list', () => {
    describe('works in windows', () => {
      beforeEach(() => {
        mockPathSep('\\');
        context.workspace = { name: 'ws-1', uri: { fsPath: 'c:\\ws-1' } };
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
        context.testResolveProvider.getTestList.mockReturnValue(testFiles);
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
        context.createTestRun.mockImplementation(createRun);
        testFiles = ['/ws-1/src/a.test.ts', '/ws-1/src/b.test.ts', '/ws-1/src/app/app.test.ts'];
        context.testResolveProvider.getTestList.mockReturnValue(testFiles);
        wsRoot = new WorkspaceRoot(context);
        wsRoot.discoverTest(runMock);
      });
      it('add', () => {
        // add 2 new files
        const withNewTestFiles = [...testFiles, '/ws-1/tests/d.test.ts', '/ws-1/src/c.test.ts'];

        // trigger event
        context.testResolveProvider.events.testListUpdated.event.mock.calls[0][0](withNewTestFiles);

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
        context.testResolveProvider.events.testListUpdated.event.mock.calls[0][0](withoutAppFiles);

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
        context.testResolveProvider.events.testListUpdated.event.mock.calls[0][0](withRenamed);

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
      const parent: any = makeTestItem('ws-1', 'ws-1', { fsPath: '/ws-1' }, undefined);
      a1 = helper.makeAssertion('test-1', 'KnownSuccess', ['desc-1'], [1, 0]);
      const assertionContainer = buildAssertionContainer([a1]);
      context.testResolveProvider.getTestSuiteResult.mockReturnValueOnce({
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
      const assertionContainer = buildAssertionContainer([a1, a2, a3]);
      context.testResolveProvider.getTestSuiteResult.mockReturnValue({
        status: 'KnownFail',
        assertionContainer,
      });
      runMock = createRun({}, 'runMock');
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
    });
    it('delete', () => {
      // delete the only test -1
      const assertionContainer = buildAssertionContainer([]);
      context.testResolveProvider.getTestSuiteResult.mockReturnValueOnce({
        status: 'Unknown',
        assertionContainer,
      });
      runMock = createRun({}, 'runMock');
      docRoot.discoverTest(runMock);
      expect(docRoot.item.children.size).toEqual(0);
    });
    it('rename', () => {
      const a2 = helper.makeAssertion('test-2', 'KnownFail', [], [1, 0]);
      const assertionContainer = buildAssertionContainer([a2]);
      context.testResolveProvider.getTestSuiteResult.mockReturnValue({
        status: 'KnownFail',
        assertionContainer,
      });

      runMock = createRun({}, 'runMock');
      docRoot.discoverTest(runMock);
      expect(docRoot.item.children.size).toEqual(1);
      expect(runMock.failed).toBeCalledWith(docRoot.item, expect.anything());
      const t2 = getChildItem(docRoot.item, 'test-2');
      expect(t2).not.toBeUndefined();
      expect(runMock.failed).toBeCalledWith(t2, expect.anything());
    });
  });
});
