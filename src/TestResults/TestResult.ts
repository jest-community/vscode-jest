import { TestReconciliationState } from './TestReconciliationState';
import { JestFileResults, JestTotalResults } from 'jest-editor-support';
import { FileCoverage } from 'istanbul-lib-coverage';
import * as path from 'path';
import { cleanAnsi } from '../helpers';

export interface Location {
  /** Zero-based column number */
  column: number;

  /** Zero-based line number */
  line: number;
}

export interface LocationRange {
  start: Location;
  end: Location;
}

export interface TestResult extends LocationRange {
  name: string;

  status: TestReconciliationState;
  shortMessage?: string;
  terseMessage?: string;

  /** Zero-based line number */
  lineNumberOfError?: number;
}

export const withLowerCaseWindowsDriveLetter = (filePath: string): string | undefined => {
  const match = filePath.match(/^([A-Z]:\\)(.*)$/);
  if (match) {
    return `${match[1].toLowerCase()}${match[2]}`;
  }
};

function testResultWithLowerCaseWindowsDriveLetter(testResult: JestFileResults): JestFileResults {
  const newFilePath = withLowerCaseWindowsDriveLetter(testResult.name);
  if (newFilePath) {
    return {
      ...testResult,
      name: newFilePath,
    };
  }

  return testResult;
}

export const testResultsWithLowerCaseWindowsDriveLetters = (
  testResults: JestFileResults[]
): JestFileResults[] => {
  if (!testResults) {
    return testResults;
  }

  return testResults.map(testResultWithLowerCaseWindowsDriveLetter);
};

function fileCoverageWithLowerCaseWindowsDriveLetter(fileCoverage: FileCoverage) {
  const newFilePath = withLowerCaseWindowsDriveLetter(fileCoverage.path);
  if (newFilePath) {
    return {
      ...fileCoverage,
      path: newFilePath,
    };
  }

  return fileCoverage;
}

export const coverageMapWithLowerCaseWindowsDriveLetters = (data: JestTotalResults) => {
  if (!data.coverageMap) {
    return;
  }

  const result = {};
  const filePaths = Object.keys(data.coverageMap);
  for (const filePath of filePaths) {
    const newFileCoverage = fileCoverageWithLowerCaseWindowsDriveLetter(data.coverageMap[filePath]);
    result[newFileCoverage.path] = newFileCoverage;
  }

  return result;
};

/**
 * Normalize file paths on Windows systems to use lowercase drive letters.
 * This follows the standard used by Visual Studio Code for URIs which includes
 * the document fileName property.
 *
 * @param data Parsed JSON results
 */
export const resultsWithLowerCaseWindowsDriveLetters = (
  data: JestTotalResults
): JestTotalResults => {
  if (path.sep === '\\') {
    return {
      ...data,
      coverageMap: coverageMapWithLowerCaseWindowsDriveLetters(data),
      testResults: testResultsWithLowerCaseWindowsDriveLetters(data.testResults),
    };
  }

  return data;
};

/**
 * Removes ANSI escape sequence characters from test results in order to get clean messages
 */
export const resultsWithoutAnsiEscapeSequence = (data: JestTotalResults): JestTotalResults => {
  if (!data || !data.testResults) {
    return data;
  }

  return {
    ...data,
    testResults: data.testResults.map((result) => ({
      ...result,
      message: cleanAnsi(result.message),
      assertionResults: result.assertionResults.map((assertion) => ({
        ...assertion,
        failureMessages: assertion.failureMessages.map((message) => cleanAnsi(message)),
      })),
    })),
  };
};
