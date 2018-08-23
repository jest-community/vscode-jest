import * as vscode from 'vscode'
import { TestResultFile, TestResultSuite, TestResultTest } from './TestResultTree'
import { extensionName } from '../appGlobals'

export type NodeStatus = 'unknown' | 'passed' | 'failed' | 'skipped'

export class JestTreeNode extends vscode.TreeItem {
  constructor(
    label: string,
    public readonly children: JestTreeNode[],
    context: SidebarContext,
    public contextValue: string = '',
    public readonly status: NodeStatus = 'unknown'
  ) {
    super(label, children.length > 0 ? context.getTreeItemCollapsibleState() : vscode.TreeItemCollapsibleState.None)

    if (this.status === 'unknown') {
      this.status = this.calculateStatus()
    }

    this.iconPath = context.getIconPath(this.status)
  }

  get tooltip(): string {
    return this.terseTooltip
  }

  get terseTooltip(): string {
    if (this.children.length > 0) {
      return this.children.map(c => `${this.label} > ` + c.terseTooltip.replace(/\n/g, `\n${this.label} > `)).join('\n')
    }
    const prettyStatus = this.status.charAt(0).toUpperCase() + this.status.toLowerCase().slice(1)
    return `${this.label} ● ${prettyStatus}`
  }

  calculateStatus(): NodeStatus {
    if (this.children.length > 0) {
      if (this.children.find(c => c.status === 'failed')) {
        return 'failed'
      }
      if (this.children.find(c => c.status === 'skipped')) {
        return 'skipped'
      }
      if (!this.children.find(c => c.status !== 'passed')) {
        return 'passed'
      }
    }

    return 'unknown'
  }
}

export class JestTreeNodeForTest extends JestTreeNode {
  constructor(private test: TestResultTest, context: SidebarContext) {
    super(test.name, [], context, 'test', convertTestStatus(test.status))
  }

  get tooltip(): string {
    if (this.test.failureMessages.length > 0) {
      return `${this.terseTooltip}\n\n${this.test.failureMessages.join('\n')}`
    }
    return this.terseTooltip
  }

  get command(): vscode.Command {
    return {
      title: 'Show test',
      command: `${extensionName}.show-test`,
      arguments: [this.test.filename, this.test.line],
    }
    // codeLens.command = {
    //   arguments: [codeLens.fileName, escapeRegExp(codeLens.testName)],
    //   command: `${extensionName}.run-test`,
    //   title: 'Debug',
    // }
  }
}

export interface ISidebarSettings {
  showFiles: boolean
  autoExpand: boolean
}

export class SidebarContext {
  showFiles: boolean
  autoExpand: boolean

  constructor(private extensionContext: vscode.ExtensionContext, private settings: ISidebarSettings) {
    this.showFiles = settings.showFiles
    this.autoExpand = settings.autoExpand
  }

  getTreeItemCollapsibleState() {
    return this.settings.autoExpand
      ? vscode.TreeItemCollapsibleState.Expanded
      : vscode.TreeItemCollapsibleState.Collapsed
  }

  getIconPath(iconColor: string) {
    return {
      light: this.extensionContext.asAbsolutePath('./src/SideBar/light-' + iconColor + '.svg'),
      dark: this.extensionContext.asAbsolutePath('./src/SideBar/dark-' + iconColor + '.svg'),
    }
  }
}

function convertTestStatus(testStatus: 'failed' | 'passed' | 'pending'): NodeStatus {
  return testStatus === 'pending' ? 'skipped' : testStatus
}

export function generateTree(files: undefined | TestResultFile[], context: SidebarContext): JestTreeNode {
  const rootNode = new JestTreeNode(
    'Tests',
    files === undefined ? [] : getNodesFromFiles(files, context),
    context,
    'root'
  )
  rootNode.collapsibleState = vscode.TreeItemCollapsibleState.Expanded
  return rootNode
}

function getNodesFromFiles(files: TestResultFile[], context: SidebarContext): JestTreeNode[] {
  return [].concat(...files.map(f => getNodesFromFile(f, context)))
}

function getNodesFromFile(file: TestResultFile, context: SidebarContext): JestTreeNode[] {
  if (context.showFiles) {
    return [new JestTreeNode(cleanFilename(file.name), getNodesFromSuite(file.suite, context), context, 'file')]
  } else {
    if (file.suite.tests.length === 0) {
      return getNodesFromSuite(file.suite, context)
    } else {
      return file.suite.suites
        .map(s => new JestTreeNode(s.name, getNodesFromSuite(s, context), context, 'suite'))
        .concat([
          new JestTreeNode(
            cleanFilename(file.name),
            file.suite.tests.map(t => new JestTreeNodeForTest(t, context)),
            context,
            'file'
          ),
        ])
    }
  }
}

function cleanFilename(filename: string): string {
  const file = vscode.Uri.file(filename)
  const folder = vscode.workspace.getWorkspaceFolder(file)
  if (folder && folder.uri && file.path.toLowerCase().startsWith(folder.uri.path.toLowerCase())) {
    return file.path.substring(folder.uri.path.length + 1)
  }
  return filename
}

function getNodesFromSuite(suite: TestResultSuite, context: SidebarContext): JestTreeNode[] {
  return suite.suites
    .map(s => new JestTreeNode(s.name, getNodesFromSuite(s, context), context, 'suite'))
    .concat(suite.tests.map(t => new JestTreeNodeForTest(t, context)))
}
