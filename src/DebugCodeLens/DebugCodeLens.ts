import * as vscode from 'vscode';

export class DebugCodeLens extends vscode.CodeLens {
  readonly fileName: string;
  readonly testName: string;
  readonly document: vscode.TextDocument;

  constructor(
    document: vscode.TextDocument,
    range: vscode.Range,
    fileName: string,
    testName: string
  ) {
    super(range);
    this.document = document;
    this.fileName = fileName;
    this.testName = testName;
  }
}
