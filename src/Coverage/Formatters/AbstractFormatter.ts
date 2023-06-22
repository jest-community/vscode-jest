import { FileCoverage } from 'istanbul-lib-coverage';
import * as vscode from 'vscode';
import { CoverageMapProvider } from '../CoverageMapProvider';
import { CoverageColors, CoverageStatus } from '../CoverageOverlay';

export type CoverageRanges = Partial<Record<CoverageStatus, vscode.Range[]>>;

type FunctionCoverageByLine = { [line: number]: number };
export abstract class AbstractFormatter {
  protected coverageMapProvider: CoverageMapProvider;
  protected colors?: CoverageColors;

  constructor(coverageMapProvider: CoverageMapProvider, colors?: CoverageColors) {
    this.coverageMapProvider = coverageMapProvider;
    this.colors = colors;
  }

  abstract format(editor: vscode.TextEditor): void;
  /** remove decorators for the given editor */
  abstract clear(editor: vscode.TextEditor): void;
  /** dispose decorators for all editors */
  abstract dispose(): void;

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
    }
  }

  private getFunctionCoverageByLine(fileCoverage: FileCoverage): FunctionCoverageByLine {
    const lineCoverage: FunctionCoverageByLine = {};
    Object.entries(fileCoverage.fnMap).forEach(([k, { decl }]) => {
      const hits = fileCoverage.f[k];
      for (let idx = decl.start.line; idx <= decl.end.line; idx++) {
        lineCoverage[idx] = hits;
      }
    });
    return lineCoverage;
  }
  /**
   * mapping the coverage map to a line-based coverage ranges
   * the coverage format is based on instanbuljs: https://github.com/istanbuljs/istanbuljs/blob/master/docs/raw-output.md
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
    const branchCoverage = fileCoverage.getBranchCoverageByLine();
    const funcCoverage = this.getFunctionCoverageByLine(fileCoverage);

    // consolidate the coverage by line
    for (let line = 1; line <= editor.document.lineCount; line++) {
      const zeroBasedLineNumber = line - 1;
      const lc = lineCoverage[line];
      const bc = branchCoverage[line];
      const fc = funcCoverage[line];
      const statusList: CoverageStatus[] = [];
      if (fc != null) {
        statusList.push(fc > 0 ? 'covered' : 'uncovered');
      }
      if (bc != null) {
        switch (bc.coverage) {
          case 100:
            statusList.push('covered');
            break;
          case 0:
            statusList.push('uncovered');
            break;
          default:
            statusList.push('partially-covered');
            break;
        }
      }
      if (lc != null) {
        statusList.push(lc > 0 ? 'covered' : 'uncovered');
      }
      if (statusList.length <= 0 && onNoCoverageInfo) {
        statusList.push(onNoCoverageInfo());
      }

      if (statusList.length <= 0) {
        continue;
      }
      // sort by severity: uncovered > partially-covered > covered
      statusList.sort((s1, s2) => {
        if (s1 === s2) {
          return 0;
        }
        switch (s1) {
          case 'covered':
            return 1;
          case 'partially-covered':
            return s2 === 'covered' ? -1 : 1;
          case 'uncovered':
            return -1;
        }
      });
      const status = statusList[0];

      const range = new vscode.Range(zeroBasedLineNumber, 0, zeroBasedLineNumber, 0);
      const list = ranges[status];
      if (list) {
        list.push(range);
      } else {
        ranges[status] = [range];
      }
    }
    return ranges;
  }
}
