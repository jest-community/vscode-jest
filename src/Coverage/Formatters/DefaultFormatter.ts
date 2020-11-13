import { AbstractFormatter } from './AbstractFormatter';
import * as vscode from 'vscode';
import { CoverageMapProvider } from '../CoverageMapProvider';
import { CoverageColors } from '../CoverageOverlay';

export class DefaultFormatter extends AbstractFormatter {
  readonly uncoveredLine: vscode.TextEditorDecorationType;
  readonly partiallyCoveredLine: vscode.TextEditorDecorationType;

  constructor(coverageMapProvider: CoverageMapProvider, colors?: CoverageColors) {
    super(coverageMapProvider, colors);
    this.partiallyCoveredLine = vscode.window.createTextEditorDecorationType({
      isWholeLine: true,
      backgroundColor: this.getColorString('partially-covered', 0.4),
      overviewRulerColor: this.getColorString('partially-covered', 0.8),
      overviewRulerLane: vscode.OverviewRulerLane.Left,
    });
    this.uncoveredLine = vscode.window.createTextEditorDecorationType({
      isWholeLine: true,
      backgroundColor: this.getColorString('uncovered', 0.4),
      overviewRulerColor: this.getColorString('uncovered', 0.8),
      overviewRulerLane: vscode.OverviewRulerLane.Left,
    });
  }

  format(editor: vscode.TextEditor): void {
    const coverageRanges = this.lineCoverageRanges(editor);
    editor.setDecorations(this.uncoveredLine, coverageRanges['uncovered'] ?? []);
    editor.setDecorations(this.partiallyCoveredLine, coverageRanges['partially-covered'] ?? []);
  }

  clear(editor: vscode.TextEditor): void {
    editor.setDecorations(this.uncoveredLine, []);
    editor.setDecorations(this.partiallyCoveredLine, []);
  }
  dispose(): void {
    this.partiallyCoveredLine.dispose();
    this.uncoveredLine.dispose();
  }
}
