import * as vscode from 'vscode';

import { GetJestExtByURI } from '../extensionManager';

export class CoverageCodeLensProvider implements vscode.CodeLensProvider {
  private getJestExt: GetJestExtByURI;
  private onDidChange: vscode.EventEmitter<void>;
  onDidChangeCodeLenses: vscode.Event<void>;

  constructor(getJestExt: GetJestExtByURI) {
    this.getJestExt = getJestExt;
    this.onDidChange = new vscode.EventEmitter();
    this.onDidChangeCodeLenses = this.onDidChange.event;
  }

  public provideCodeLenses(document: vscode.TextDocument): vscode.CodeLens[] {
    const ext = this.getJestExt(document.uri);
    const coverage =
      ext &&
      ext.coverageOverlay.enabled &&
      ext.coverageMapProvider.getFileCoverage(document.fileName);
    if (!coverage) {
      return;
    }

    const summary = coverage.toSummary();
    const json = summary.toJSON();
    const metrics = Object.keys(json).reduce((previous, metric) => {
      return `${previous}${previous ? ', ' : ''}${metric}: ${json[metric].pct}%`;
    }, '');

    const range = new vscode.Range(0, 0, 0, 0);
    const command: vscode.Command = {
      title: metrics,
      command: null,
    };

    return [new vscode.CodeLens(range, command)];
  }
  public coverageChanged(): void {
    this.onDidChange.fire();
  }
}
