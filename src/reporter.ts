// Custom Jest reporter used by jest-vscode extension

import {
  Reporter,
  TestContext,
  ReporterOnStartOptions,
  Test,
  TestResult,
  AggregatedResult,
} from '@jest/reporters';
import type { TestResultJestRunEventArguments } from './JestExt';

class VSCodeJestReporter implements Reporter {
  onRunStart(aggregatedResults: AggregatedResult, _options: ReporterOnStartOptions): void {
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

  getLastError(): Error | undefined {
    return;
  }

  onTestResult(_test: Test, _testResult: TestResult, aggregatedResult: AggregatedResult): void {
    process.stderr.write(
      `onTestResult: test: ${JSON.stringify({ aggregatedResult: aggregatedResult } as TestResultJestRunEventArguments)}\r\n`
    );
  }
}

module.exports = VSCodeJestReporter;
