import { CoverageMapProvider } from '../CoverageMapProvider';
import * as vscode from 'vscode';
import { CoverageColors, CoverageStatus } from '../CoverageOverlay';

export type CoverageRanges = {
  [status in CoverageStatus]?: vscode.Range[];
};

export abstract class AbstractFormatter {
  protected coverageMapProvider: CoverageMapProvider;
  protected colors?: CoverageColors;

  constructor(coverageMapProvider: CoverageMapProvider, colors?: CoverageColors) {
    this.coverageMapProvider = coverageMapProvider;
    this.colors = colors;
  }

  abstract format(editor: vscode.TextEditor);
  /** remove decoractors for the given editor */
  abstract clear(editor: vscode.TextEditor);
  /** dispose decoractors for all editors */
  abstract dispose();

  /**
   * returns rgba color string similar to istanbul html report color scheme
   * @param status
   * @param opacity
   */
  getColorString(status: CoverageStatus, opacity: number): string {
    if (opacity > 1 || opacity < 0) {
      throw new Error(`invalid opacity (${opacity}): value is not between 0 - 1`);
    }

    switch (status) {
      case 'covered':
        return this.colors?.[status] ?? `rgba(9, 156, 65, ${opacity})`; // green
      case 'partially-covered':
        return this.colors?.[status] ?? `rgba(235, 198, 52, ${opacity})`; // yellow
      case 'uncovered':
        return this.colors?.[status] ?? `rgba(121, 31, 10, ${opacity})`; // red
      default:
        throw new Error(`unrecognized status: ${status}`);
    }
  }
  /**
   * mapping the coverage map to a line-based coverage ranges
   * @param editor
   */
  lineCoverageRanges(
    editor: vscode.TextEditor,
    onNoCoverageInfo?: () => CoverageStatus
  ): CoverageRanges {
    const ranges: CoverageRanges = {};
    const fileCoverage = this.coverageMapProvider.getFileCoverage(editor.document.fileName);
    if (!fileCoverage) {
      return ranges;
    }
    const lineCoverage = fileCoverage.getLineCoverage();
    const branchCoveravge = fileCoverage.getBranchCoverageByLine();

    // consolidate the coverage by line
    for (let line = 1; line <= editor.document.lineCount; line++) {
      const zeroBasedLineNumber = line - 1;
      const range = new vscode.Range(zeroBasedLineNumber, 0, zeroBasedLineNumber, 0);
      const lc = lineCoverage[line];
      const bc = branchCoveravge[line];
      let status: CoverageStatus;
      if (bc != null) {
        switch (bc.coverage) {
          case 1:
            status = 'covered';
            break;
          case 0:
            status = 'uncovered';
            break;
          default:
            status = 'partially-covered';
            break;
        }
      } else if (lc != null) {
        status = lc > 0 ? 'covered' : 'uncovered';
      } else if (onNoCoverageInfo) {
        status = onNoCoverageInfo();
      } else {
        continue;
      }

      if (ranges[status] != null) {
        ranges[status].push(range);
      } else {
        ranges[status] = [range];
      }
    }
    return ranges;
  }
}
