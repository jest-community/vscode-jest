import * as vscode from 'vscode'
import { JestTotalResults, JestFileResults } from 'jest-editor-support'
import { JestTreeNode, SidebarContext, ISidebarSettings, generateTree } from './JestTreeNode'
import { TestResultFile } from './TestResultTree'
import { TestResultProvider } from '../TestResults'

export class JestTreeProvider implements vscode.TreeDataProvider<JestTreeNode> {
  private _onDidChangeTreeData: vscode.EventEmitter<JestTreeNode | undefined> = new vscode.EventEmitter<
    JestTreeNode | undefined
  >()
  readonly onDidChangeTreeData: vscode.Event<JestTreeNode | undefined> = this._onDidChangeTreeData.event

  private context: SidebarContext
  private rootNode: JestTreeNode

  constructor(
    private testResultProvider: TestResultProvider,
    extensionContext: vscode.ExtensionContext,
    settings: ISidebarSettings
  ) {
    this.context = new SidebarContext(extensionContext, settings)
    this.rootNode = generateTree(undefined, this.context)
  }

  refresh(data: JestTotalResults): void {
    this.loadTestResults(data)
    this._onDidChangeTreeData.fire()
  }

  getTreeItem(element: JestTreeNode): vscode.TreeItem {
    return element
  }

  getChildren(element?: JestTreeNode): JestTreeNode[] {
    if (!element) {
      return this.getRootElements()
    } else {
      return this.getElementChildren(element)
    }
  }

  private loadTestResults(data: JestTotalResults) {
    const testFiles = data.testResults.map(r => this.loadTestResultsForFile(r))
    this.rootNode = generateTree(testFiles, this.context)
  }

  private loadTestResultsForFile(data: JestFileResults): TestResultFile {
    const parsedResults = this.testResultProvider.getResults(data.name)
    return new TestResultFile(data, parsedResults)
  }

  private getRootElements(): JestTreeNode[] {
    return [this.rootNode]
  }

  private getElementChildren(node: JestTreeNode): JestTreeNode[] {
    return node.children
  }
}
