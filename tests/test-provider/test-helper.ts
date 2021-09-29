/* eslint-disable @typescript-eslint/explicit-module-boundary-types */
import * as vscode from 'vscode';
import { mockJestExtEvents } from '../test-helper';

export class TestItemCollectionMock {
  constructor(public parent?: vscode.TestItem) {}
  private items: vscode.TestItem[] = [];
  get size(): number {
    return this.items.length;
  }
  replace = (list: vscode.TestItem[]): void => {
    this.items = list;
  };
  get = (id: string): vscode.TestItem | undefined => this.items.find((i) => i.id === id);
  add = (item: vscode.TestItem): void => {
    this.items.push(item);
    (item as any).parent = this.parent;
  };
  delete = (id: string): void => {
    this.items = this.items.filter((i) => i.id !== id);
  };
  forEach = (f: (item: vscode.TestItem) => void): void => {
    this.items.forEach(f);
  };
}

export const mockExtExplorerContext = (wsName = 'ws-1', override: any = {}): any => {
  return {
    loggingFactory: { create: jest.fn().mockReturnValue(jest.fn()) },
    autoRun: {},
    session: { scheduleProcess: jest.fn() },
    workspace: { name: wsName, uri: { fsPath: `/${wsName}` } },
    testResolveProvider: {
      events: {
        testListUpdated: { event: jest.fn().mockReturnValue({ dispose: jest.fn() }) },
        testSuiteChanged: { event: jest.fn().mockReturnValue({ dispose: jest.fn() }) },
      },
      getTestList: jest.fn().mockReturnValue([]),
      isTestFile: jest.fn().mockReturnValue('yes'),
      getTestSuiteResult: jest.fn().mockReturnValue({}),
    },
    debugTests: jest.fn(),
    sessionEvents: mockJestExtEvents(),
    settings: { testExplorer: { enabled: true } },
    ...override,
  };
};

export const mockRun = (request?: any, name?: any): any => ({
  request,
  name,
  started: jest.fn(),
  passed: jest.fn(),
  skipped: jest.fn(),
  errored: jest.fn(),
  failed: jest.fn(),
  enqueued: jest.fn(),
  appendOutput: jest.fn(),
  end: jest.fn(),
  token: { onCancellationRequested: jest.fn() },
});
export const mockController = (): any => {
  const runMocks = [];
  return {
    runMocks,
    lastRunMock: () => (runMocks.length > 0 ? runMocks[runMocks.length - 1] : undefined),
    createTestRun: jest.fn().mockImplementation((r, n) => {
      const run = mockRun(r, n);
      runMocks.push(run);
      return run;
    }),
    dispose: jest.fn(),
    createRunProfile: jest.fn(),
    createTestItem: jest.fn().mockImplementation((id, label, uri) => {
      const item: any = {
        id,
        label,
        uri,
        errored: jest.fn(),
      };
      item.children = new TestItemCollectionMock(item);
      return item;
    }),
    items: new TestItemCollectionMock(),
  };
};
