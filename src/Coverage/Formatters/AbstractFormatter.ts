import { CoverageMapProvider } from '../CoverageMapProvider';
import * as vscode from 'vscode';

export abstract class AbstractFormatter {
  protected coverageMapProvider: CoverageMapProvider;

  constructor(coverageMapProvider: CoverageMapProvider) {
    this.coverageMapProvider = coverageMapProvider;
  }

  abstract format(editor: vscode.TextEditor);
  abstract clear(editor: vscode.TextEditor);
}
