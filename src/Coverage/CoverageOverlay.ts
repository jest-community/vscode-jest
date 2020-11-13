import { AbstractFormatter } from './Formatters/AbstractFormatter';
import { CoverageMapProvider } from './CoverageMapProvider';
import { DefaultFormatter } from './Formatters/DefaultFormatter';
import { GutterFormatter } from './Formatters/GutterFormatter';
import * as vscode from 'vscode';
import { hasDocument } from '../editor';

export type CoverageStatus = 'covered' | 'partially-covered' | 'uncovered';
export type CoverageColors = {
  [key in CoverageStatus]?: string;
};

export class CoverageOverlay {
  static readonly defaultVisibility = false;
  static readonly defaultFormatter = 'DefaultFormatter';
  formatter: AbstractFormatter;
  private _enabled: boolean;

  constructor(
    context: vscode.ExtensionContext,
    coverageMapProvider: CoverageMapProvider,
    enabled: boolean = CoverageOverlay.defaultVisibility,
    coverageFormatter: string = CoverageOverlay.defaultFormatter,
    colors?: CoverageColors
  ) {
    this._enabled = enabled;
    switch (coverageFormatter) {
      case 'GutterFormatter':
        this.formatter = new GutterFormatter(context, coverageMapProvider, colors);
        break;

      default:
        this.formatter = new DefaultFormatter(coverageMapProvider, colors);
        break;
    }
  }

  get enabled(): boolean {
    return this._enabled;
  }

  set enabled(value: boolean) {
    this._enabled = value;
    this.updateVisibleEditors();
  }

  /** give formatter opportunity to dispose the decorators */
  dispose(): void {
    this.formatter.dispose();
  }

  toggleVisibility(): void {
    this._enabled = !this._enabled;
    this.updateVisibleEditors();
  }

  updateVisibleEditors(): void {
    for (const editor of vscode.window.visibleTextEditors) {
      this.update(editor);
    }
  }

  update(editor: vscode.TextEditor): void {
    if (!hasDocument(editor)) {
      return;
    }

    if (this._enabled) {
      this.formatter.format(editor);
    } else {
      this.formatter.clear(editor);
    }
  }
}
