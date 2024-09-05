import * as vscode from 'vscode';
import { FileCoverage, createFileCoverage, Range } from 'istanbul-lib-coverage';
import { JestSessionEvents, JestTestDataAvailableEvent } from '../JestExt/types';

const isRange = (location: vscode.Position | vscode.Range): location is vscode.Range =>
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (location as any).start !== undefined && (location as any).end !== undefined;

export class JestFileCoverage extends vscode.FileCoverage {
  private iCoverage: FileCoverage;
  private details?: vscode.FileCoverageDetail[];

  constructor(fileCoverage: FileCoverage) {
    const summary = fileCoverage.toSummary();
    super(
      vscode.Uri.file(fileCoverage.path),
      new vscode.TestCoverageCount(summary.lines.covered, summary.lines.total),
      new vscode.TestCoverageCount(summary.branches.covered, summary.branches.total),
      new vscode.TestCoverageCount(summary.functions.covered, summary.functions.total)
    );
    this.iCoverage = fileCoverage;
  }
  public get rawCoverage(): FileCoverage {
    return this.iCoverage;
  }

  private isInvalidRange = (range: Range): boolean =>
    range.start.line === undefined || range.end.line === undefined;

  public loadDetails(): vscode.FileCoverageDetail[] {
    if (this.details) {
      return this.details;
    }

    const transformed = this.iCoverage;
    const details: vscode.FileCoverageDetail[] = [];
    // zero-based line number to statement coverage
    const statementByLine: Record<number, vscode.StatementCoverage> = {};

    const getEOL = (line: number): number | undefined => {
      const statement = statementByLine[line];
      if (statement && isRange(statement.location)) {
        return statement.location.end.character;
      }
    };

    // transform istanbul line number from 1-based to vscode 0-based
    // and replace null end-column with the end of line, if available
    const transformRange = (range: Range): vscode.Range | undefined => {
      if (this.isInvalidRange(range)) {
        return;
      }

      const endColumn = range.end.column ?? getEOL(range.end.line) ?? range.start.column;
      return new vscode.Range(
        range.start.line - 1,
        range.start.column,
        range.end.line - 1,
        endColumn
      );
    };

    try {
      // Collect statements and index by start line for direct access
      Object.entries(transformed.statementMap).forEach(([statementId, range]) => {
        const executionCount = transformed.s[statementId];
        const vRange = transformRange(range);
        if (!vRange) {
          return;
        }
        const statementCoverage = new vscode.StatementCoverage(executionCount, vRange);
        details.push(statementCoverage);
        statementByLine[vRange.start.line] = statementCoverage;
      });

      // Process branches and attach them directly to the corresponding statement coverage
      Object.entries(transformed.branchMap).forEach(([branchId, branch]) => {
        branch.locations.forEach((location, index) => {
          const branchExecutionCount = transformed.b[branchId][index];
          const vRange = transformRange(location);
          if (!vRange) {
            return;
          }
          const branchCoverage = new vscode.BranchCoverage(
            branchExecutionCount > 0,
            vRange,
            `"${branch.type.toUpperCase()}" (ID: ${branchId}, Path: ${index + 1})`
          );

          if (statementByLine[vRange.start.line]) {
            statementByLine[vRange.start.line].branches.push(branchCoverage);
          }
        });
      });

      // Process functions, adjusting end column using statementByLine if needed
      Object.entries(transformed.fnMap).forEach(([functionId, func]) => {
        const executionCount = transformed.f[functionId];
        const vRange = transformRange(func.loc);
        if (!vRange) {
          return;
        }
        details.push(new vscode.DeclarationCoverage(func.name, executionCount, vRange));
      });
    } catch (e) {
      console.error(`JestFileCoverage getDetailed failed for ${this.iCoverage.path}:`, e);
      return [];
    }

    if (details.length > 0) {
      this.details = details;
    }

    return details;
  }
}

export class JestTestCoverageProvider {
  private subscriptions: vscode.Disposable[] = [];

  constructor(events: JestSessionEvents) {
    this.subscriptions.push(events.onTestDataAvailable.event(this.onTestDataAvailable));
  }

  private onTestDataAvailable = (event: JestTestDataAvailableEvent): void => {
    const run = event.process.userData?.run;
    if (event.data.coverageMap && run) {
      for (const fileCoverage of Object.values(event.data.coverageMap)) {
        const jestFileCoverage = new JestFileCoverage(createFileCoverage(fileCoverage));
        run.addCoverage(jestFileCoverage);
      }
    }
  };

  public async loadDetailedCoverage(
    fileCoverage: vscode.FileCoverage
  ): Promise<vscode.FileCoverageDetail[]> {
    if (!(fileCoverage instanceof JestFileCoverage)) {
      throw new Error(
        'Invalid file coverage object, expected JestFileCoverage instance. but got: ' +
          typeof fileCoverage
      );
    }
    const details = fileCoverage.loadDetails();
    return details;
  }

  public dispose(): void {
    this.subscriptions.forEach((sub) => sub.dispose());
  }
}
