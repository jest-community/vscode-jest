import * as vscode from 'vscode';

import { GetJestExtByURI } from '../extension-manager';
import { FileCoverage } from 'istanbul-lib-coverage';

export class CoverageCodeLensProvider implements vscode.CodeLensProvider {
  private getJestExt: GetJestExtByURI;
  private onDidChange: vscode.EventEmitter<void>;
  onDidChangeCodeLenses: vscode.Event<void>;

  constructor(getJestExt: GetJestExtByURI) {
    this.getJestExt = getJestExt;
    this.onDidChange = new vscode.EventEmitter();
    this.onDidChangeCodeLenses = this.onDidChange.event;
  }

  private createCodeLensForCoverage(coverage: FileCoverage, name?: string): vscode.CodeLens {
    const summary = coverage.toSummary();
    const json = summary.toJSON();
    const metrics = (Object.keys(json) as Array<keyof typeof json>).reduce((previous, metric) => {
      return `${previous}${previous ? ', ' : ''}${metric}: ${json[metric].pct}%`;
    }, '');

    const range = new vscode.Range(0, 0, 0, 0);
    const command: vscode.Command = {
      title: name ? `${name}: ${metrics}` : metrics,
      command: '',
    };

    return new vscode.CodeLens(range, command);
  }

  public provideCodeLenses(
    document: vscode.TextDocument
  ): vscode.ProviderResult<vscode.CodeLens[]> {
    const coverages: [FileCoverage, string][] = this.getJestExt(document.uri)
      .map((ext) => {
        if (ext.coverageOverlay.enabled) {
          return [ext.coverageMapProvider.getFileCoverage(document.fileName), ext.name];
        }
      })
      .filter((coverageInfo) => coverageInfo?.[0] != null) as [FileCoverage, string][];

    if (coverages.length === 0) {
      return undefined;
    }
    if (coverages.length === 1) {
      return [this.createCodeLensForCoverage(coverages[0][0])];
    }
    return coverages.map(([coverage, name]) => this.createCodeLensForCoverage(coverage, name));
  }
  public coverageChanged(): void {
    this.onDidChange.fire();
  }
}
