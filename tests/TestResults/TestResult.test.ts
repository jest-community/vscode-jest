jest.unmock('../../src/TestResults/TestResult');
jest.unmock('../../src/helpers');
jest.mock('path', () => ({ sep: require.requireActual('path').sep }));

import * as TestResult from '../../src/TestResults/TestResult';
import * as path from 'path';

const {
  resultsWithLowerCaseWindowsDriveLetters,
  coverageMapWithLowerCaseWindowsDriveLetters,
  testResultsWithLowerCaseWindowsDriveLetters,
  resultsWithoutAnsiEscapeSequence,
  withLowerCaseWindowsDriveLetter,
} = TestResult;

describe('TestResult', () => {
  describe('resultsWithLowerCaseWindowsDriveLetters', () => {
    describe('on POSIX systems', () => {
      it('should return the results unchanged', () => {
        (path as any).sep = '/';
        const expected: any = {};

        expect(resultsWithLowerCaseWindowsDriveLetters(expected)).toBe(expected);
      });
    });

    // tslint:disable no-shadowed-variable
    describe('on Windows systems', () => {
      beforeEach(() => {
        (path as any).sep = '\\';
      });

      it('should normalize paths in the coverage map', () => {
        const spy = jest.spyOn(TestResult, 'coverageMapWithLowerCaseWindowsDriveLetters');
        const data: any = { coverageMap: {} };
        resultsWithLowerCaseWindowsDriveLetters(data);
        expect(spy).toHaveBeenCalled();
      });

      it('should normalize paths in the test results', () => {
        const spy = jest.spyOn(TestResult, 'testResultsWithLowerCaseWindowsDriveLetters');
        const data: any = { coverageMap: {} };
        resultsWithLowerCaseWindowsDriveLetters(data);
        expect(spy).toHaveBeenCalled();
      });
    });
  });

  describe('resultsWithoutAnsiEscapeSequence', () => {
    it('should not break when there is no data or testResults', () => {
      expect(resultsWithoutAnsiEscapeSequence(undefined)).toEqual(undefined);
      const noTestResults: any = {};
      expect(resultsWithoutAnsiEscapeSequence(noTestResults)).toEqual({});
    });
    it('should remove ANSI characters from the test results when provided', () => {
      const data: any = {
        testResults: [
          {
            message:
              '\u001b[36m<body>\u001b[39m \u001b[36m<div>\u001b[39m \u001b[36m<div\u001b[39m \u001b[33mclass\u001b[39m=\u001b[32m"root"\u001b[39m \u001b[36m>\u001b[39m \u001b[0mLearn React\u001b[0m \u001b[36m</div>\u001b[39m \u001b[36m</div>\u001b[39m\u001b[36m</body>\u001b[39m',
            assertionResults: [
              {
                failureMessages: [
                  '\u001b[36m<body>\u001b[39m \u001b[36m<div>\u001b[39m \u001b[36m<div\u001b[39m \u001b[33mclass\u001b[39m=\u001b[32m"root"\u001b[39m \u001b[36m>\u001b[39m \u001b[0mLearn React\u001b[0m \u001b[36m</div>\u001b[39m \u001b[36m</div>\u001b[39m\u001b[36m</body>\u001b[39m',
                ],
              },
            ],
          },
        ],
      };
      expect(resultsWithoutAnsiEscapeSequence(data).testResults).toEqual([
        {
          message: '<body> <div> <div class="root" > Learn React </div> </div></body>',
          assertionResults: [
            {
              failureMessages: [
                '<body> <div> <div class="root" > Learn React </div> </div></body>',
              ],
            },
          ],
        },
      ]);
    });
  });

  describe('testResultsWithLowerCaseWindowsDriveLetters', () => {
    it('should return nothing the test results when the results are undefined', () => {
      const testResults: any = undefined;
      expect(testResultsWithLowerCaseWindowsDriveLetters(testResults)).toBeUndefined();
    });

    it('should return the test results when no tests were run', () => {
      const testResults: any = [];
      expect(testResultsWithLowerCaseWindowsDriveLetters(testResults)).toEqual(testResults);
    });

    it('should normalizes paths in the test results when provided', () => {
      const testResults: any = [
        { name: 'c:\\drive\\is\\lowercase' },
        { name: 'D:\\drive\\is\\uppercase' },
      ];
      expect(testResultsWithLowerCaseWindowsDriveLetters(testResults)).toEqual([
        { name: 'c:\\drive\\is\\lowercase' },
        { name: 'd:\\drive\\is\\uppercase' },
      ]);
    });
  });

  describe('coverageMapWithLowerCaseWindowsDriveLetters', () => {
    it('should return nothing when coverage was not collected', () => {
      const data: any = {};
      expect(coverageMapWithLowerCaseWindowsDriveLetters(data)).toBeUndefined();
    });

    it('should normalizes paths in the coverage map when collected', () => {
      const data: any = {
        coverageMap: {
          'c:\\drive\\is\\lowercase': {
            path: 'c:\\drive\\is\\lowercase',
            property: {},
          },
          'D:\\drive\\is\\uppercase': {
            path: 'D:\\drive\\is\\uppercase',
            property: {},
          },
        },
      };
      expect(coverageMapWithLowerCaseWindowsDriveLetters(data)).toEqual({
        'c:\\drive\\is\\lowercase': {
          path: 'c:\\drive\\is\\lowercase',
          property: {},
        },
        'd:\\drive\\is\\uppercase': {
          path: 'd:\\drive\\is\\uppercase',
          property: {},
        },
      });
    });
  });

  describe('withLowerCaseDriveLetter', () => {
    it('should return a new file path when provided a path with an upper case drive letter', () => {
      const filePath = 'C:\\path\\file.ext';
      expect(withLowerCaseWindowsDriveLetter(filePath)).toBe('c:\\path\\file.ext');
    });

    it('should indicate no change is required otherwise', () => {
      const filePath = 'c:\\path\\file.ext';
      expect(withLowerCaseWindowsDriveLetter(filePath)).toBeUndefined();
    });
  });
});
