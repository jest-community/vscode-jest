import { CoverageMapProvider } from '../../CoverageMapProvider';
import { AbstractFormatter } from '../AbstractFormatter';
import * as vscode from 'vscode';
import { prepareIconFile } from '../../../helpers';
import coverageGutterIcon from './coverage.svg';
import { CoverageColors } from '../../CoverageOverlay';

export class GutterFormatter extends AbstractFormatter {
  readonly uncoveredLine: vscode.TextEditorDecorationType;
  readonly partiallyCoveredLine: vscode.TextEditorDecorationType;
  readonly coveredLine: vscode.TextEditorDecorationType;

  constructor(
    context: vscode.ExtensionContext,
    coverageMapProvider: CoverageMapProvider,
    colors?: CoverageColors
  ) {
    super(coverageMapProvider, colors);

    const coveredColor = this.getColorString('covered', 0.75);
    const uncoveredColor = this.getColorString('uncovered', 0.75);
    const partiallyCoveredColor = this.getColorString('partially-covered', 0.75);
    this.uncoveredLine = vscode.window.createTextEditorDecorationType({
      overviewRulerColor: uncoveredColor,
      overviewRulerLane: vscode.OverviewRulerLane.Left,
      gutterIconPath: this.iconUri(context, 'uncovered', coverageGutterIcon, uncoveredColor),
    });

    this.partiallyCoveredLine = vscode.window.createTextEditorDecorationType({
      overviewRulerColor: partiallyCoveredColor,
      overviewRulerLane: vscode.OverviewRulerLane.Left,
      gutterIconPath: this.iconUri(
        context,
        'partially-covered',
        coverageGutterIcon,
        partiallyCoveredColor
      ),
    });

    this.coveredLine = vscode.window.createTextEditorDecorationType({
      gutterIconPath: this.iconUri(context, 'covered', coverageGutterIcon, coveredColor),
    });
  }
  // convert iconPath to uri to prevent render cache icon by fileName alone
  // even after file content has changed such as color changed
  private iconUri(
    context: vscode.ExtensionContext,
    iconName: string,
    source: string,
    color: string
  ): vscode.Uri {
    const iconPath = prepareIconFile(context, iconName, source, color);
    return vscode.Uri.file(iconPath).with({ query: `color=${color}` });
  }
  format(editor: vscode.TextEditor): void {
    const coverageRanges = this.lineCoverageRanges(editor, () => 'covered');
    editor.setDecorations(this.uncoveredLine, coverageRanges['uncovered'] ?? []);
    editor.setDecorations(this.partiallyCoveredLine, coverageRanges['partially-covered'] ?? []);
    editor.setDecorations(this.coveredLine, coverageRanges['covered'] ?? []);
  }

  clear(editor: vscode.TextEditor): void {
    editor.setDecorations(this.coveredLine, []);
    editor.setDecorations(this.partiallyCoveredLine, []);
    editor.setDecorations(this.uncoveredLine, []);
  }

  dispose(): void {
    this.coveredLine.dispose();
    this.partiallyCoveredLine.dispose();
    this.uncoveredLine.dispose();
  }
}
