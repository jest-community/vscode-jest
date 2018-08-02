import * as vscode from 'vscode'
import { TestResultFile, TestResultSuite, TestResultTest } from './TestResultTree'
import { extensionName } from '../appGlobals'

export type NodeStatus = 'unknown' | 'passed' | 'failed' | 'skipped'

export class JestTreeNode extends vscode.TreeItem {
  constructor(
    label: string,
    public readonly children: JestTreeNode[],
    context: SidebarContext,
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

export class JestTreeNodeForFileBase extends JestTreeNode {
  protected static getChildrenFromFile(file: TestResultFile, context: SidebarContext) {
    return file.suites.map(s => new JestTreeNodeForSuite(s, context))
  }
}

export class JestTreeNodeForFiles extends JestTreeNodeForFileBase {
  constructor(files: undefined | TestResultFile[], context: SidebarContext) {
    super('Tests', files === undefined ? [] : JestTreeNodeForFiles.getChildrenFromFiles(files, context), context)
    this.collapsibleState = vscode.TreeItemCollapsibleState.Expanded
  }

  get contextValue() {
    return 'suite'
  }

  private static getChildrenFromFiles(files: TestResultFile[], context: SidebarContext) {
    if (context.showFiles) {
      return files.map(f => new JestTreeNodeForFile(f, context))
    } else {
      return [].concat(...files.map(f => this.getChildrenFromFile(f, context)))
    }
  }
}

export class JestTreeNodeForFile extends JestTreeNodeForFileBase {
  constructor(file: TestResultFile, context: SidebarContext) {
    super(file.name, JestTreeNodeForFile.getChildrenFromFile(file, context), context)
  }

  get contextValue() {
    return 'suite'
  }
}

export class JestTreeNodeForSuite extends JestTreeNode {
  constructor(suite: TestResultSuite, context: SidebarContext) {
    super(suite.name, JestTreeNodeForSuite.getChildrenFromSuite(suite, context), context)
  }

  get contextValue() {
    return 'suite'
  }

  private static getChildrenFromSuite(suite: TestResultSuite, context: SidebarContext) {
    return suite.suites
      .map(s => <JestTreeNode>new JestTreeNodeForSuite(s, context))
      .concat(suite.tests.map(t => new JestTreeNodeForTest(t, context)))
  }
}

export class JestTreeNodeForTest extends JestTreeNode {
  constructor(private test: TestResultTest, context: SidebarContext) {
    super(test.name, [], context, JestTreeNodeForTest.convertTestStatus(test.status))
  }

  get contextValue() {
    return 'test'
  }

  private static convertTestStatus(testStatus: 'failed' | 'passed' | 'pending'): NodeStatus {
    return testStatus === 'pending' ? 'skipped' : testStatus
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
