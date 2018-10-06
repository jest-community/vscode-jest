jest.unmock('../../src/SideBar/JestTreeNode')

jest.mock('vscode', () => {
  const vscode = {
    TreeItem: class {
      constructor(public label: string, public collapsibleState?: vscode.TreeItemCollapsibleState) {}
    },
    TreeItemCollapsibleState: jest.fn<vscode.TreeItemCollapsibleState>(),
    workspace: {
      getWorkspaceFolder: jest.fn<vscode.WorkspaceFolder>().mockImplementation(_ => {
        return {
          uri: {
            path: '/FOLDER/PATH',
          },
        }
      }),
    },
    Uri: {
      file: jest.fn<vscode.Uri>().mockImplementation(filename => {
        return {
          path: '/FOLDER/PATH/' + filename,
        }
      }),
    },
  }

  return vscode
})

import * as vscode from 'vscode'
import {
  SidebarContext,
  JestTreeNode,
  NodeStatus,
  JestTreeNodeForTest,
  generateTree,
} from '../../src/SideBar/JestTreeNode'
import { TestResultFile, TestResultSuite, TestResultTest } from '../../src/SideBar/TestResultTree'
import { extensionName } from '../../src/appGlobals'

describe('JestTreeNode', () => {
  let sidebarContext: SidebarContext

  beforeEach(() => {
    sidebarContext = mockSidebarContext()
  })

  it('should accept no children', () => {
    const node = new JestTreeNode('label', [], sidebarContext, 'root')

    expect(node).toBeInstanceOf(vscode.TreeItem)

    expect(node).toMatchObject({
      label: 'label',
      collapsibleState: vscode.TreeItemCollapsibleState.None,
      children: [],
      status: 'unknown',
      iconPath: 'unknown-icon',
      tooltip: 'label ● Unknown',
      contextValue: 'root',
    })
  })

  it('should accept children', () => {
    const children = [
      jest.fn<JestTreeNode>(() => {
        return {
          status: 'passed',
          terseTooltip: 'terse-tooltip',
        }
      })(),
      jest.fn<JestTreeNode>(() => {
        return {
          status: 'passed',
          terseTooltip: 'terse-tooltip2',
        }
      })(),
    ]

    const node = new JestTreeNode('label', children, sidebarContext)

    expect(node).toBeInstanceOf(vscode.TreeItem)

    expect(node).toMatchObject({
      label: 'label',
      collapsibleState: vscode.TreeItemCollapsibleState.Collapsed,
      children: children,
      status: 'passed',
      iconPath: 'passed-icon',
      tooltip: 'label > terse-tooltip\nlabel > terse-tooltip2',
    })
  })

  const runStatusTest = (statuses: NodeStatus[]) => {
    const children = statuses.slice(1).map(s =>
      jest.fn<JestTreeNode>(() => {
        return {
          status: s,
        }
      })()
    )

    const node = new JestTreeNode('label', children, sidebarContext)

    expect(node.status).toBe(statuses[0])
  }

  it('should calculate status', () => {
    ;[
      ['unknown'],
      ['passed', 'passed', 'passed'],
      ['failed', 'failed', 'passed'],
      ['skipped', 'skipped', 'passed'],
      ['unknown', 'unknown', 'passed'],
      ['failed', 'failed', 'failed'],
      ['failed', 'skipped', 'failed'],
      ['failed', 'unknown', 'failed'],
      ['skipped', 'skipped', 'skipped'],
      ['skipped', 'skipped', 'unknown'],
      ['unknown', 'unknown', 'unknown'],
      ['failed', 'failed', 'passed', 'skipped'],
      ['failed', 'failed', 'passed', 'unknown'],
      ['failed', 'failed', 'skipped', 'unknown'],
      ['skipped', 'passed', 'skipped', 'unknown'],
      ['failed', 'failed', 'passed', 'skipped', 'unknown'],
    ].forEach((statuses: NodeStatus[]) => runStatusTest(statuses))
  })
})

describe('generateTree', () => {
  let sidebarContext: SidebarContext

  beforeEach(() => {
    sidebarContext = mockSidebarContext()
  })

  it('should accept no files', () => {
    const node = generateTree(undefined, sidebarContext)

    expect(node).toMatchObject({
      label: 'Tests',
      collapsibleState: vscode.TreeItemCollapsibleState.Expanded,
      children: [],
      contextValue: 'root',
    })
  })

  it('should accept files', () => {
    const node = generateTree([mockFile('filename1', [mockSuite('suite1', [], [])], [])], sidebarContext)

    expect(node).toMatchObject({
      label: 'Tests',
      collapsibleState: vscode.TreeItemCollapsibleState.Expanded,
      children: [{ label: 'suite1' }],
      contextValue: 'root',
    })
  })

  it('should accept files when files are shown in sidebar', () => {
    sidebarContext.showFiles = true

    const node = generateTree([mockFile('filename1', [mockSuite('suite1', [], [])], [])], sidebarContext)

    expect(node).toMatchObject({
      label: 'Tests',
      collapsibleState: vscode.TreeItemCollapsibleState.Expanded,
      children: [
        {
          label: 'filename1',
          children: [{ label: 'suite1' }],
        },
      ],
    })
  })

  it('should accept files with multiple root suites', () => {
    const node = generateTree(
      [mockFile('filename1', [mockSuite('suite1', [], []), mockSuite('suite2', [], [])], [])],
      sidebarContext
    )

    expect(node).toMatchObject({
      label: 'Tests',
      collapsibleState: vscode.TreeItemCollapsibleState.Expanded,
      children: [{ label: 'suite1' }, { label: 'suite2' }],
    })
  })

  it('should accept files with multiple root suites when files are shown in sidebar', () => {
    sidebarContext.showFiles = true

    const node = generateTree(
      [mockFile('filename1', [mockSuite('suite1', [], []), mockSuite('suite2', [], [])], [])],
      sidebarContext
    )

    expect(node).toMatchObject({
      label: 'Tests',
      collapsibleState: vscode.TreeItemCollapsibleState.Expanded,
      children: [
        {
          label: 'filename1',
          children: [{ label: 'suite1' }, { label: 'suite2' }],
        },
      ],
    })
  })

  it('should accept files with root tests', () => {
    const node = generateTree([mockFile('filename1', [], [mockTest('test1')])], sidebarContext)

    expect(node).toMatchObject({
      label: 'Tests',
      collapsibleState: vscode.TreeItemCollapsibleState.Expanded,
      children: [
        {
          label: 'filename1',
          children: [{ label: 'test1' }],
        },
      ],
    })
  })

  it('should accept files with root tests when files are shown in sidebar', () => {
    sidebarContext.showFiles = true

    const node = generateTree([mockFile('filename1', [], [mockTest('test1')])], sidebarContext)

    expect(node).toMatchObject({
      label: 'Tests',
      collapsibleState: vscode.TreeItemCollapsibleState.Expanded,
      children: [
        {
          label: 'filename1',
          children: [{ label: 'test1' }],
        },
      ],
    })
  })

  it('should accept files with root tests and suites', () => {
    const node = generateTree(
      [
        mockFile(
          'filename1',
          [
            mockSuite(
              'suite1',
              [
                mockSuite('suite1-1', [], [mockTest('test1-1-1'), mockTest('test1-1-2')]),
                mockSuite('suite1-2', [], []),
              ],
              [mockTest('test1-1'), mockTest('test1-2'), mockTest('test1-3')]
            ),
            mockSuite('suite2', [], [mockTest('test2-1')]),
          ],
          [mockTest('test1')]
        ),
      ],
      sidebarContext
    )

    expect(node).toMatchObject({
      label: 'Tests',
      collapsibleState: vscode.TreeItemCollapsibleState.Expanded,
      children: [
        {
          label: 'suite1',
          children: [
            {
              label: 'suite1-1',
              children: [{ label: 'test1-1-1' }, { label: 'test1-1-2' }],
            },
            { label: 'suite1-2', children: [] },
            { label: 'test1-1' },
            { label: 'test1-2' },
            { label: 'test1-3' },
          ],
        },
        {
          label: 'suite2',
          children: [{ label: 'test2-1' }],
        },
        {
          label: 'filename1',
          children: [{ label: 'test1' }],
        },
      ],
    })
  })

  it('should accept files with root tests and suites when files are shown in sidebar', () => {
    sidebarContext.showFiles = true

    const node = generateTree(
      [
        mockFile(
          'filename1',
          [
            mockSuite(
              'suite1',
              [
                mockSuite('suite1-1', [], [mockTest('test1-1-1'), mockTest('test1-1-2')]),
                mockSuite('suite1-2', [], []),
              ],
              [mockTest('test1-1'), mockTest('test1-2'), mockTest('test1-3')]
            ),
            mockSuite('suite2', [], [mockTest('test2-1')]),
          ],
          [mockTest('test1')]
        ),
      ],
      sidebarContext
    )

    expect(node).toMatchObject({
      label: 'Tests',
      collapsibleState: vscode.TreeItemCollapsibleState.Expanded,
      children: [
        {
          label: 'filename1',
          children: [
            {
              label: 'suite1',
              children: [
                {
                  label: 'suite1-1',
                  children: [{ label: 'test1-1-1' }, { label: 'test1-1-2' }],
                },
                { label: 'suite1-2', children: [] },
                { label: 'test1-1' },
                { label: 'test1-2' },
                { label: 'test1-3' },
              ],
            },
            {
              label: 'suite2',
              children: [{ label: 'test2-1' }],
            },
            { label: 'test1' },
          ],
        },
      ],
    })
  })
})

const mockTest = (name: string, status: string = 'unknown', failureMessages: string[] = []): TestResultTest => {
  return jest.fn<TestResultTest>(() => {
    return {
      name: name,
      status: status,
      failureMessages: failureMessages,
    }
  })()
}

const mockSuite = (name: string, suites: TestResultSuite[], tests: TestResultTest[]): TestResultSuite => {
  return jest.fn<TestResultSuite>(() => {
    return {
      name: name,
      suites: suites,
      tests: tests,
    }
  })()
}

const mockFile = (filename: string, suites: TestResultSuite[], tests: TestResultTest[]): TestResultFile => {
  return jest.fn<TestResultFile>(() => {
    return {
      name: filename,
      suite: mockSuite('', suites, tests),
    }
  })()
}

describe('JestTreeNodeForTest', () => {
  let sidebarContext: SidebarContext

  beforeEach(() => {
    sidebarContext = mockSidebarContext()
  })

  it('should accept test', () => {
    const node = new JestTreeNodeForTest(mockTest('test1'), sidebarContext)

    expect(node).toMatchObject({
      label: 'test1',
      collapsibleState: vscode.TreeItemCollapsibleState.None,
      children: [],
      tooltip: 'test1 ● Unknown',
      contextValue: 'test',
    })
  })

  it('should convert status', () => {
    ;[['failed', 'failed'], ['passed', 'passed'], ['pending', 'skipped']].forEach(statuses => {
      const node = new JestTreeNodeForTest(mockTest('test1', statuses[0]), sidebarContext)

      expect(node.status).toEqual(statuses[1])
    })
  })

  it('should generate tooltip for failure', () => {
    const node = new JestTreeNodeForTest(mockTest('test1', 'failed', ['failure1', 'failure2']), sidebarContext)

    expect(node).toMatchObject({
      tooltip: 'test1 ● Failed\n\nfailure1\nfailure2',
    })
  })

  it('should set command', () => {
    const node = new JestTreeNodeForTest(
      jest.fn<TestResultTest>(() => {
        return {
          name: 'test',
          status: 'passed',
          filename: 'filename',
          line: 28,
        }
      })(),
      sidebarContext
    )

    expect(node.command).toMatchObject({
      title: 'Show test',
      command: `${extensionName}.show-test`,
      arguments: ['filename', 28],
    })
  })
})

describe('SidebarContext', () => {
  it('should get TreeItemCollapsibleState when auto expand is enabled', () => {
    const context = new SidebarContext(jest.fn<vscode.ExtensionContext>()(), {
      autoExpand: true,
      showFiles: false,
    })
    expect(context.getTreeItemCollapsibleState()).toBe(vscode.TreeItemCollapsibleState.Collapsed)
  })

  it('should get TreeItemCollapsibleState when auto expand is disabled', () => {
    const context = new SidebarContext(jest.fn<vscode.ExtensionContext>()(), {
      autoExpand: false,
      showFiles: false,
    })
    expect(context.getTreeItemCollapsibleState()).toBe(vscode.TreeItemCollapsibleState.Collapsed)
  })

  it('should get TreeItemCollapsibleState when auto expand is enabled and settings are updated', () => {
    const context = new SidebarContext(jest.fn<vscode.ExtensionContext>()(), {
      autoExpand: false,
      showFiles: false,
    })
    context.updateSettings({
      autoExpand: true,
      showFiles: false,
    })
    expect(context.getTreeItemCollapsibleState()).toBe(vscode.TreeItemCollapsibleState.Collapsed)
  })

  it('should get TreeItemCollapsibleState when auto expand is disabled and settings are updated', () => {
    const context = new SidebarContext(jest.fn<vscode.ExtensionContext>()(), {
      autoExpand: true,
      showFiles: false,
    })
    context.updateSettings({
      autoExpand: false,
      showFiles: false,
    })
    expect(context.getTreeItemCollapsibleState()).toBe(vscode.TreeItemCollapsibleState.Collapsed)
  })

  it('should get icon path based on color', () => {
    const context = new SidebarContext(
      jest.fn<vscode.ExtensionContext>(() => {
        return {
          asAbsolutePath: jest.fn().mockImplementation((relativePath: string) => 'ROOT' + relativePath),
        }
      })(),
      {
        autoExpand: false,
        showFiles: false,
      }
    )
    expect(context.getIconPath('color')).toMatchObject({
      light: 'ROOT./src/SideBar/light-color.svg',
      dark: 'ROOT./src/SideBar/dark-color.svg',
    })
  })
})

const mockSidebarContext = () =>
  jest.fn<SidebarContext>(() => {
    return {
      showFiles: false,
      autoExpand: false,
      getIconPath: jest.fn().mockImplementation((status: string) => status + '-icon'),
      getTreeItemCollapsibleState: jest.fn().mockReturnValue(vscode.TreeItemCollapsibleState.Collapsed),
    }
  })()
