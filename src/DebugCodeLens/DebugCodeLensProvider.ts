import * as vscode from 'vscode';
import { extensionName } from '../appGlobals';
import { basename } from 'path';
import { DebugCodeLens } from './DebugCodeLens';
import { TestReconciliationStateType } from '../TestResults';
import { TestState, TestStateByTestReconciliationState } from './TestState';
import { GetJestExtByURI } from '../extensionManager';

export class DebugCodeLensProvider implements vscode.CodeLensProvider {
  onDidChange: vscode.EventEmitter<void>;
  private _showWhenTestStateIn: TestState[];
  private getJestExt: GetJestExtByURI;

  constructor(getJestExt: GetJestExtByURI, showWhenTestStateIn: TestState[] = []) {
    this.getJestExt = getJestExt;
    this._showWhenTestStateIn = showWhenTestStateIn;
    this.onDidChange = new vscode.EventEmitter();
  }

  get showWhenTestStateIn(): TestState[] {
    return this._showWhenTestStateIn;
  }

  set showWhenTestStateIn(value: TestState[]) {
    this._showWhenTestStateIn = value;
    this.onDidChange.fire();
  }

  get onDidChangeCodeLenses(): vscode.Event<void> {
    return this.onDidChange.event;
  }

  provideCodeLenses(document: vscode.TextDocument, _: vscode.CancellationToken): DebugCodeLens[] {
    const result = [];
    const ext = this.getJestExt(document.uri);
    if (!ext || this._showWhenTestStateIn.length === 0 || document.isUntitled) {
      return result;
    }

    const filePath = document.fileName;
    const testResults = ext.testResultProvider.getResults(filePath);
    const fileName = basename(document.fileName);

    for (const test of testResults) {
      const results = test.multiResults ? [test, ...test.multiResults] : [test];
      const allIds = results.filter((r) => this.showCodeLensAboveTest(r)).map((r) => r.identifier);

      if (!allIds.length) {
        continue;
      }

      const start = new vscode.Position(test.start.line, test.start.column);
      const end = new vscode.Position(test.end.line, test.start.column + 5);
      const range = new vscode.Range(start, end);

      result.push(new DebugCodeLens(document, range, fileName, ...allIds));
    }

    return result;
  }

  showCodeLensAboveTest(test: { status: TestReconciliationStateType }): boolean {
    const state = TestStateByTestReconciliationState[test.status];
    return this._showWhenTestStateIn.includes(state);
  }

  resolveCodeLens(
    codeLens: vscode.CodeLens,
    _: vscode.CancellationToken
  ): vscode.ProviderResult<vscode.CodeLens> {
    if (codeLens instanceof DebugCodeLens) {
      codeLens.command = {
        arguments: [codeLens.document, codeLens.fileName, ...codeLens.testIds],
        command: `${extensionName}.run-test`,
        title: codeLens.testIds.length > 1 ? `Debug(${codeLens.testIds.length})` : 'Debug',
      };
    }

    return codeLens;
  }

  didChange(): void {
    this.onDidChange.fire();
  }
}
