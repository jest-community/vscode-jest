// Custom Jest reporter used by jest-vscode extension

import type { AggregatedResult } from '@jest/test-result';
import { Reporter, Context } from '@jest/reporters';

export interface VSCodeJestReporterOptions {
  reportingInterval: number;
}
export default class VSCodeJestReporter implements Reporter {
  private reportTime = 0;
  private startTime = 0;
  private options: VSCodeJestReporterOptions;

  constructor(
    _globalConfig: unknown,
    options: VSCodeJestReporterOptions = { reportingInterval: 30000 } // 30 second default interval
  ) {
    this.options = options;
  }

  onRunStart(): void {
    this.startTime = Date.now();
    this.reportTime = this.startTime;

    console.log('onRunStart');
  }
  onTestFileStart(): void {
    const t0 = Date.now();
    if (t0 - this.reportTime > this.options.reportingInterval) {
      this.reportTime = t0;
      console.log(`ElapsedTime: ${(t0 - this.startTime) / 1000}s`);
    }
  }
  onRunComplete(_contexts: Set<Context>, results: AggregatedResult): void {
    // report exec errors
    if (results.numTotalTests === 0 && results.numTotalTestSuites > 0) {
      // TODO: check results.runExecError after Jest release https://github.com/facebook/jest/pull/13203
      console.log('onRunComplete: with execError');
    } else {
      console.log('onRunComplete');
    }
  }
  getLastError(): Error | undefined {
    return;
  }
}
