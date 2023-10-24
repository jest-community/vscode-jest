// Custom Jest reporter used by jest-vscode extension

import type { AggregatedResult, Test, TestResult } from '@jest/test-result';
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
    } else {
      process.stderr.write('onRunComplete\r\n');
    }
  }

  // report any test or exec errors
  onTestFileResult(
    _test: Test,
    testResult: TestResult,
    _aggregatedResult: AggregatedResult
  ): Promise<void> | void {
    if (testResult.numFailingTests > 0 || testResult.testExecError) {
      const msg = `onTestFileResult: encountered errors`;
      console.log(msg);
      process.stderr.write(`${msg}\r\n`);
    }
  }

  getLastError(): Error | undefined {
    return;
  }
}

module.exports = VSCodeJestReporter;
