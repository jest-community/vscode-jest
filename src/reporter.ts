// Custom Jest reporter used by jest-vscode extension

import type { AggregatedResult } from '@jest/test-result';
import { Reporter, Context } from '@jest/reporters';

export default class VSCodeJestReporter implements Reporter {
  onRunStart(aggregatedResults: AggregatedResult): void {
    console.log(`onRunStart: numTotalTestSuites: ${aggregatedResults.numTotalTestSuites}`);
  }

  onRunComplete(_contexts: Set<Context>, results: AggregatedResult): void {
    // report exec errors that could have prevented Result file being generated
    // TODO: replace with checking results.runExecError after Jest release https://github.com/facebook/jest/pull/13203
    if (results.numTotalTests === 0 && results.numTotalTestSuites > 0) {
      console.log('onRunComplete: execError: no test is run');
    } else {
      console.log('onRunComplete');
    }
  }
  getLastError(): Error | undefined {
    return;
  }
}
