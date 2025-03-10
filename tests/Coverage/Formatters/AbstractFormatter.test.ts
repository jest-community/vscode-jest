jest.unmock('../../../src/Coverage/Formatters/AbstractFormatter');

const mockRange = jest
  .fn()
  .mockImplementation((startLine: number, startChar: number, endLine: number, endChar: number) => ({
    start: {
      line: startLine,
      character: startChar,
    },
    end: {
      line: endLine,
      character: endChar,
    },
  }));

jest.mock('vscode', () => ({
  Range: mockRange,
}));

import { Range } from 'istanbul-lib-coverage';
import { CoverageStatus } from '../../../src/Coverage/CoverageOverlay';
import {
  AbstractFormatter,
  CoverageRanges,
} from '../../../src/Coverage/Formatters/AbstractFormatter';

class TestFormatter extends AbstractFormatter {
  format() {}
  clear() {}
  dispose() {}
}

type ExpectedCoverageInfo = {
  [status in CoverageStatus]?: number[];
};

const isEqual = (coverage: CoverageRanges, expected: ExpectedCoverageInfo): boolean => {
  expect(Object.keys(expected).length).toEqual(Object.keys(coverage).length);

  Object.keys(expected).forEach((status) => {
    const lines: number[] = expected[status];
    const ranges = coverage[status];
    if (!ranges) {
      expect(ranges).not.toBeUndefined();
      return false;
    }
    expect(ranges.length).toEqual(lines.length);
    lines.forEach((line, idx) => {
      const range = ranges[idx];
      expect(range.start.line).toEqual(line);
      expect(range.end.line).toEqual(line);
      expect(range.start.character).toEqual(0);
      expect(range.end.character).toEqual(0);
    });
  });
  return true;
};

interface FunctionLineCoverage {
  line: number;
  hits: number;
}
const generateFunctionCoverage = (fileCoverage: any, ...testData: FunctionLineCoverage[]) => {
  const fnMap: { [key: number]: { decl: Range } } = {};
  const f: { [key: number]: number } = {};
  testData.forEach(({ line, hits }, idx) => {
    fnMap[idx] = { decl: { start: { line, column: 0 }, end: { line, column: null } } };
    f[idx] = hits;
  });
  fileCoverage.fnMap = fnMap;
  fileCoverage.f = f;
};

describe('AbstractFormatter', () => {
  const editor: any = {
    document: { fileName: 'testing' },
  };
  const mockGetLineCoverage = jest.fn();
  const mockGetBranchCoverageByLine = jest.fn();

  const fileCoverage = {
    getLineCoverage: mockGetLineCoverage,
    getBranchCoverageByLine: mockGetBranchCoverageByLine,
  };

  const mockGetFileCoverage = jest.fn();
  const coverageMapProvider: any = {
    getFileCoverage: mockGetFileCoverage,
  };
  beforeEach(() => {
    jest.clearAllMocks();
    generateFunctionCoverage(fileCoverage);
  });

  describe('lineCoverageRanges', () => {
    beforeEach(() => {
      mockGetLineCoverage.mockReturnValue({});
      mockGetBranchCoverageByLine.mockReturnValue({});
    });
    it('should get the file coverage from the coverage provider', () => {
      const formatter = new TestFormatter(coverageMapProvider);
      formatter.lineCoverageRanges(editor);
      expect(mockGetFileCoverage).toHaveBeenCalledWith(editor.document.fileName);
    });

    it('if no coverage, should returns empty range', () => {
      mockGetFileCoverage.mockReturnValue(undefined);
      const formatter = new TestFormatter(coverageMapProvider);
      const coverRanges = formatter.lineCoverageRanges(editor);
      expect(Object.keys(coverRanges)).toEqual([]);
    });
    it('converts coverageMap 1-based location to 0-based vscode.Range', () => {
      mockGetLineCoverage.mockReturnValue({ 1: 1 });
      mockGetFileCoverage.mockReturnValue(fileCoverage);
      const formatter = new TestFormatter(coverageMapProvider);

      editor.document.lineCount = 1;
      const coverRanges = formatter.lineCoverageRanges(editor);
      const expected: ExpectedCoverageInfo = { covered: [0] };
      expect(isEqual(coverRanges, expected)).toBeTruthy();
    });
    it('reflect function coverage status', () => {
      generateFunctionCoverage(fileCoverage, { hits: 1, line: 1 }, { hits: 0, line: 2 });
      const formatter = new TestFormatter(coverageMapProvider);

      editor.document.lineCount = 2;
      const coverRanges = formatter.lineCoverageRanges(editor);
      const expected: ExpectedCoverageInfo = { covered: [0], uncovered: [1] };
      expect(isEqual(coverRanges, expected)).toBeTruthy();
    });
    it('reflect line coverage status', () => {
      mockGetLineCoverage.mockReturnValue({ 1: 1, 2: 0, 3: 2 });
      mockGetFileCoverage.mockReturnValue(fileCoverage);
      const formatter = new TestFormatter(coverageMapProvider);

      editor.document.lineCount = 3;
      const coverRanges = formatter.lineCoverageRanges(editor);
      const expected: ExpectedCoverageInfo = { covered: [0, 2], uncovered: [1] };
      expect(isEqual(coverRanges, expected)).toBeTruthy();
    });

    it('reflect branch coverage status', () => {
      const bc = {
        1: { coverage: 100 },
        3: { coverage: 50 },
        4: { coverage: 0 },
      };
      mockGetBranchCoverageByLine.mockReturnValue(bc);
      mockGetLineCoverage.mockReturnValue({});
      mockGetFileCoverage.mockReturnValue(fileCoverage);
      const formatter = new TestFormatter(coverageMapProvider);

      editor.document.lineCount = 5;
      const coverRanges = formatter.lineCoverageRanges(editor);
      const expected: ExpectedCoverageInfo = {
        covered: [0],
        'partially-covered': [2],
        uncovered: [3],
      };
      expect(isEqual(coverRanges, expected)).toBeTruthy();
    });
    describe('reports highest severity', () => {
      it.each`
        case | line | branch | func | expected
        ${1} | ${1} | ${0}   | ${1} | ${'uncovered'}
        ${2} | ${1} | ${50}  | ${1} | ${'partially-covered'}
        ${3} | ${0} | ${50}  | ${1} | ${'uncovered'}
        ${4} | ${1} | ${100} | ${1} | ${'covered'}
      `('case $case', ({ line, branch, func, expected }) => {
        const bc = {
          1: { coverage: branch },
        };
        const lc = {
          1: line,
        };
        generateFunctionCoverage(fileCoverage, { line: 1, hits: func });
        mockGetBranchCoverageByLine.mockReturnValue(bc);
        mockGetLineCoverage.mockReturnValue(lc);
        mockGetFileCoverage.mockReturnValue(fileCoverage);
        const formatter = new TestFormatter(coverageMapProvider);

        editor.document.lineCount = 1;
        const coverRanges = formatter.lineCoverageRanges(editor);
        ['covered', 'partially-covered', 'uncovered'].forEach((s) => {
          if (s === expected) {
            expect(coverRanges[s]).not.toBeUndefined();
          } else {
            expect(coverRanges[s]).toBeUndefined();
          }
        });
      });
    });
    describe('for line without any coverage info, i.e. blank line', () => {
      beforeEach(() => {
        const bc = {
          3: { coverage: 50 },
          4: { coverage: 0 },
        };
        const lc = {
          1: 1,
          5: 1,
        };
        mockGetBranchCoverageByLine.mockReturnValue(bc);
        mockGetLineCoverage.mockReturnValue(lc);
        mockGetFileCoverage.mockReturnValue(fileCoverage);
      });

      it('by default, the line will be ignored', () => {
        const formatter = new TestFormatter(coverageMapProvider);

        editor.document.lineCount = 5;
        const coverRanges = formatter.lineCoverageRanges(editor);
        const expected: ExpectedCoverageInfo = {
          covered: [0, 4],
          'partially-covered': [2],
          uncovered: [3],
        };
        expect(isEqual(coverRanges, expected)).toBeTruthy();
      });
      it('optionally, can return custom status', () => {
        const formatter = new TestFormatter(coverageMapProvider);

        editor.document.lineCount = 5;
        const coverRanges = formatter.lineCoverageRanges(editor, () => 'covered');
        const expected: ExpectedCoverageInfo = {
          covered: [0, 1, 4],
          'partially-covered': [2],
          uncovered: [3],
        };
        expect(isEqual(coverRanges, expected)).toBeTruthy();
      });
    });
  });

  describe('getColorString', () => {
    it('opacity should between 0 - 1', () => {
      const formatter = new TestFormatter(coverageMapProvider);
      expect(() => formatter.getColorString('covered', 1.5)).toThrow();
      expect(() => formatter.getColorString('covered', -0.8)).toThrow();
      expect(() => formatter.getColorString('covered', 0.8)).not.toThrow();
    });
    it('returns default color string when no customization', () => {
      const formatter = new TestFormatter(coverageMapProvider);
      expect(formatter.getColorString('covered', 1)).not.toBeUndefined();
      expect(formatter.getColorString('uncovered', 1)).not.toBeUndefined();
      expect(formatter.getColorString('partially-covered', 1)).not.toBeUndefined();
    });
    it('color includes opacity argument', () => {
      const formatter = new TestFormatter(coverageMapProvider);
      expect(formatter.getColorString('covered', 0.93)).toEqual(expect.stringContaining('0.93'));
    });
    it('return customized colors if specified', () => {
      const formatter = new TestFormatter(coverageMapProvider, {
        covered: 'covered-color',
        uncovered: 'uncovered-color',
        'partially-covered': 'partially-covered-color',
      });
      expect(formatter.getColorString('covered', 0.93)).toEqual('covered-color');
      expect(formatter.getColorString('uncovered', 0.93)).toEqual('uncovered-color');
      expect(formatter.getColorString('partially-covered', 0.93)).toEqual(
        'partially-covered-color'
      );
    });
    it('can customize just part of the coverage types', () => {
      const formatter = new TestFormatter(coverageMapProvider, {
        covered: 'covered-color',
      });
      expect(formatter.getColorString('covered', 0.93)).toEqual('covered-color');
      expect(formatter.getColorString('uncovered', 0.93)).toEqual(expect.stringContaining('0.93'));
      expect(formatter.getColorString('partially-covered', 0.93)).toEqual(
        expect.stringContaining('0.93')
      );
    });
  });
});
