import { CoverageMapProvider } from '../../CoverageMapProvider';
import { AbstractFormatter } from '../AbstractFormatter';
import * as vscode from 'vscode';
import { FileCoverage } from 'istanbul-lib-coverage';
import { isValidLocation } from '../helpers';

export interface CoverageLines {
  covered: vscode.Range[];
  partiallyCovered: vscode.Range[];
  uncovered: vscode.Range[];
}

export class GutterFormatter extends AbstractFormatter {
  private uncoveredLine: vscode.TextEditorDecorationType;
  private partiallyCoveredLine: vscode.TextEditorDecorationType;
  private coveredLine: vscode.TextEditorDecorationType;

  constructor(context: vscode.ExtensionContext, coverageMapProvider: CoverageMapProvider) {
    super(coverageMapProvider);

    this.uncoveredLine = vscode.window.createTextEditorDecorationType({
      isWholeLine: true,
      backgroundColor: '',
      overviewRulerColor: 'rgba(121, 31, 10, 0.75)',
      overviewRulerLane: vscode.OverviewRulerLane.Left,
      gutterIconPath: context.asAbsolutePath(
        './src/Coverage/Formatters/GutterFormatter/uncovered-gutter-icon.svg'
      ),
    });

    this.partiallyCoveredLine = vscode.window.createTextEditorDecorationType({
      backgroundColor: 'rgba(121, 86, 10, 0.75)',
      overviewRulerColor: 'rgba(121, 86, 10, 0.75)',
      overviewRulerLane: vscode.OverviewRulerLane.Left,
      gutterIconPath: context.asAbsolutePath(
        './src/Coverage/Formatters/GutterFormatter/partially-covered-gutter-icon.svg'
      ),
    });

    this.coveredLine = vscode.window.createTextEditorDecorationType({
      isWholeLine: true,
      backgroundColor: '',
      overviewRulerColor: '',
      overviewRulerLane: vscode.OverviewRulerLane.Left,
      gutterIconPath: context.asAbsolutePath(
        './src/Coverage/Formatters/GutterFormatter/covered-gutter-icon.svg'
      ),
    });
  }

  format(editor: vscode.TextEditor): void {
    const fileCoverage = this.coverageMapProvider.getFileCoverage(editor.document.fileName);
    if (!fileCoverage) {
      return;
    }

    const coverageFormatting = this.computeFormatting(editor, fileCoverage);

    editor.setDecorations(this.coveredLine, coverageFormatting.covered);
    editor.setDecorations(this.uncoveredLine, coverageFormatting.uncovered);
    editor.setDecorations(this.partiallyCoveredLine, coverageFormatting.partiallyCovered);
  }

  computeFormatting(editor: vscode.TextEditor, fileCoverage: FileCoverage): CoverageLines {
    const coverageFormatting: CoverageLines = {
      covered: [],
      partiallyCovered: [],
      uncovered: [],
    };

    const uncoveredLines = fileCoverage.getUncoveredLines();

    for (let line = 1; line <= editor.document.lineCount; line++) {
      const zeroBasedLineNumber = line - 1;
      if (uncoveredLines.indexOf(line) >= 0) {
        coverageFormatting.uncovered.push(
          new vscode.Range(zeroBasedLineNumber, 0, zeroBasedLineNumber, 0)
        );
      } else {
        coverageFormatting.covered.push(
          new vscode.Range(zeroBasedLineNumber, 0, zeroBasedLineNumber, 0)
        );
      }
    }

    Object.keys(fileCoverage.b).forEach((branchIndex) => {
      fileCoverage.b[branchIndex].forEach((hitCount, locationIndex) => {
        if (hitCount > 0) {
          return;
        }

        const branch = fileCoverage.branchMap[branchIndex].locations[locationIndex];
        if (!isValidLocation(branch)) {
          return;
        }

        const partialLineRange = new vscode.Range(
          branch.start.line - 1,
          0,
          branch.start.line - 1,
          0
        );
        coverageFormatting.covered = coverageFormatting.covered.filter(
          (range) => !range.isEqual(partialLineRange)
        );
        coverageFormatting.uncovered = coverageFormatting.uncovered.filter(
          (range) => !range.isEqual(partialLineRange)
        );

        coverageFormatting.partiallyCovered.push(
          new vscode.Range(
            branch.start.line - 1,
            branch.start.column,
            branch.end.line - 1,
            branch.end.column
          )
        );
      });
    });

    return coverageFormatting;
  }

  clear(editor: vscode.TextEditor): void {
    editor.setDecorations(this.coveredLine, []);
    editor.setDecorations(this.partiallyCoveredLine, []);
    editor.setDecorations(this.uncoveredLine, []);
  }
}
