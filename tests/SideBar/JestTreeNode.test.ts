jest.unmock('../../src/SideBar/JestTreeNode')

jest.mock('vscode', () => {
  const vscode = {
    TreeItem: class {
      constructor(public label: string, public collapsibleState?: vscode.TreeItemCollapsibleState) {}
    },
    TreeItemCollapsibleState: jest.fn<vscode.TreeItemCollapsibleState>(),
  }

  return vscode
})

import * as vscode from 'vscode'
import {
  SidebarContext,
  JestTreeNode,
  NodeStatus,
  JestTreeNodeForFiles,
  JestTreeNodeForFile,
  JestTreeNodeForSuite,
  JestTreeNodeForTest,
} from '../../src/SideBar/JestTreeNode'
import { TestResultFile, TestResultSuite, TestResultTest } from '../../src/SideBar/TestResultTree'

const sidebarContext: SidebarContext = jest.fn<SidebarContext>(() => {
  return {
    showFiles: false,
    autoExpand: false,
    getIconPath: jest.fn().mockImplementation((status: string) => status + '-icon'),
    getTreeItemCollapsibleState: jest.fn().mockReturnValue(vscode.TreeItemCollapsibleState.Collapsed),
  }
})()

describe('JestTreeNode', () => {
  it('should accept no children', () => {
    const node = new JestTreeNode('label', [], sidebarContext)

    expect(node).toBeInstanceOf(vscode.TreeItem)

    expect(node).toMatchObject({
      label: 'label',
      collapsibleState: vscode.TreeItemCollapsibleState.None,
      children: [],
      status: 'unknown',
      iconPath: 'unknown-icon',
      tooltip: 'label ● Unknown',
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

const mockFile = (filename: string, suites: TestResultSuite[]): TestResultFile => {
  return jest.fn<TestResultFile>(() => {
    return {
      name: filename,
      suites: suites,
    }
  })()
}

describe('JestTreeNodeForFiles', () => {
  it('should accept no files', () => {
    const node = new JestTreeNodeForFiles(undefined, sidebarContext)

    expect(node).toMatchObject({
      label: 'Tests',
      collapsibleState: vscode.TreeItemCollapsibleState.Expanded,
      children: [],
      contextValue: 'suite',
    })
  })

  it('should accept files', () => {
    const node = new JestTreeNodeForFiles([mockFile('filename1', [mockSuite('suite1', [], [])])], sidebarContext)

    expect(node).toMatchObject({
      label: 'Tests',
      collapsibleState: vscode.TreeItemCollapsibleState.Expanded,
      children: [{ label: 'suite1' }],
    })
  })

  it('should accept files when files are shown in sidebar', () => {
    sidebarContext.showFiles = true

    const node = new JestTreeNodeForFiles([mockFile('filename1', [mockSuite('suite1', [], [])])], sidebarContext)

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
})

describe('JestTreeNodeForFile', () => {
  it('should accept suites', () => {
    const node = new JestTreeNodeForFile(mockFile('filename1', [mockSuite('suite1', [], [])]), sidebarContext)

    expect(node).toMatchObject({
      label: 'filename1',
      collapsibleState: vscode.TreeItemCollapsibleState.Expanded,
      children: [{ label: 'suite1' }],
      contextValue: 'suite',
    })
  })
})

describe('JestTreeNodeForSuite', () => {
  it('should accept no suites or tests', () => {
    const node = new JestTreeNodeForSuite(mockSuite('suite1', [], []), sidebarContext)

    expect(node).toMatchObject({
      label: 'suite1',
      collapsibleState: vscode.TreeItemCollapsibleState.Expanded,
      children: [],
      contextValue: 'suite',
    })
  })

  it('should accept suites', () => {
    const node = new JestTreeNodeForSuite(mockSuite('suite1', [mockSuite('suite2', [], [])], []), sidebarContext)

    expect(node).toMatchObject({
      label: 'suite1',
      collapsibleState: vscode.TreeItemCollapsibleState.Expanded,
      children: [
        {
          label: 'suite2',
        },
      ],
    })
  })

  it('should accept tests', () => {
    const node = new JestTreeNodeForSuite(mockSuite('suite1', [], [mockTest('test1')]), sidebarContext)

    expect(node).toMatchObject({
      label: 'suite1',
      collapsibleState: vscode.TreeItemCollapsibleState.Expanded,
      children: [
        {
          label: 'test1',
        },
      ],
    })
  })
})

describe('JestTreeNodeForTest', () => {
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
