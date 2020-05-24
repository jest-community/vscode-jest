import { AbstractFormatter } from './AbstractFormatter';
import * as vscode from 'vscode';
import { FileCoverage } from 'istanbul-lib-coverage';
import { isValidLocation } from './helpers';

const uncoveredBranch = vscode.window.createTextEditorDecorationType({
  backgroundColor: 'rgba(216,134,123,0.4)',
  overviewRulerColor: 'rgba(216,134,123,0.8)',
  overviewRulerLane: vscode.OverviewRulerLane.Left,
});

const uncoveredLine = vscode.window.createTextEditorDecorationType({
  isWholeLine: true,
  backgroundColor: 'rgba(216,134,123,0.4)',
  overviewRulerColor: 'rgba(216,134,123,0.8)',
  overviewRulerLane: vscode.OverviewRulerLane.Left,
});

export class DefaultFormatter extends AbstractFormatter {
  format(editor: vscode.TextEditor) {
    const fileCoverage = this.coverageMapProvider.getFileCoverage(editor.document.fileName);
    if (!fileCoverage) {
      return;
    }

    this.formatBranches(editor, fileCoverage);
    this.formatUncoveredLines(editor, fileCoverage);
  }

  formatBranches(editor: vscode.TextEditor, fileCoverage: FileCoverage) {
    const ranges = [];

    Object.keys(fileCoverage.b).forEach((branchIndex) => {
      fileCoverage.b[branchIndex].forEach((hitCount, locationIndex) => {
        if (hitCount > 0) {
          return;
        }

        const branch = fileCoverage.branchMap[branchIndex].locations[locationIndex];
        if (!isValidLocation(branch)) {
          return;
        }

        // If the value is `null`, then set it to the first character on its
        // line.
        const endColumn = branch.end.column || 0;

        ranges.push(
          new vscode.Range(
            branch.start.line - 1,
            branch.start.column,
            branch.end.line - 1,
            endColumn
          )
        );
      });
    });

    editor.setDecorations(uncoveredBranch, ranges);
  }

  formatUncoveredLines(editor: vscode.TextEditor, fileCoverage: FileCoverage) {
    const lines = fileCoverage.getUncoveredLines();

    const ranges = [];
    for (const oneBasedLineNumber of lines) {
      const zeroBasedLineNumber = Number(oneBasedLineNumber) - 1;
      ranges.push(new vscode.Range(zeroBasedLineNumber, 0, zeroBasedLineNumber, 0));
    }

    editor.setDecorations(uncoveredLine, ranges);
  }

  clear(editor: vscode.TextEditor) {
    editor.setDecorations(uncoveredLine, []);
    editor.setDecorations(uncoveredBranch, []);
  }
}
