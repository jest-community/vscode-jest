// Custom Jest reporter used by jest-vscode extension

import type { AggregatedResult } from '@jest/test-result';
import { Reporter, Context } from '@jest/reporters';

class VSCodeJestReporter implements Reporter {
  onRunStart(aggregatedResults: AggregatedResult): void {
    process.stderr.write(
      `onRunStart: numTotalTestSuites: ${aggregatedResults.numTotalTestSuites}\r\n`
    );
  }

  onRunComplete(_contexts: Set<Context>, results: AggregatedResult): void {
    // report exec errors that could have prevented Result file being generated
    // TODO: replace with checking results.runExecError after Jest release https://github.com/facebook/jest/pull/13203
    if (results.numTotalTests === 0 && results.numTotalTestSuites > 0) {
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
