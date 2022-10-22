// Custom Jest reporter used by jest-vscode extension

import type { AggregatedResult } from '@jest/test-result';
import { Reporter, TestContext } from '@jest/reporters';

class VSCodeJestReporter implements Reporter {
  onRunStart(aggregatedResults: AggregatedResult): void {
    process.stderr.write(
      `onRunStart: numTotalTestSuites: ${aggregatedResults.numTotalTestSuites}\r\n`
    );
  }

  onRunComplete(_contexts: Set<TestContext>, results: AggregatedResult): void {
    // report exec errors that could have prevented Result file being generated
    if (results.runExecError) {
      process.stderr.write(`onRunComplete: execError: ${results.runExecError.message}\r\n`);
    } else if (results.numTotalTests === 0 && results.numTotalTestSuites > 0) {
      // for jest < 29.1.2, we won't see onRunComplete with runExecError, so try this as best effort. see https://github.com/facebook/jest/pull/13203
      process.stderr.write('onRunComplete: execError: no test is run\r\n');
    } else {
      process.stderr.write('onRunComplete\r\n');
    }
  }
  getLastError(): Error | undefined {
    return;
  }
}

module.exports = VSCodeJestReporter;
