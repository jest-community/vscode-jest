jest.unmock('../../../src/Coverage/Formatters/GutterFormatter');
jest.unmock('../../../src/Coverage/Formatters/AbstractFormatter');

class RangeMock {
  public args;
  constructor(args) {
    this.args = args;
  }

  public isEqual(range: RangeMock) {
    for (let i = 0; i < range.args.length; i++) {
      if (this.args[i] !== range.args[i]) {
        return false;
      }
    }
    return true;
  }
}

jest.mock('vscode', () => {
  return {
    OverviewRulerLane: {},
    Range: jest.fn((...args) => new RangeMock(args)),
    window: {
      createTextEditorDecorationType: jest.fn(),
    },
  };
});

import { GutterFormatter } from '../../../src/Coverage/Formatters/GutterFormatter';
import * as vscode from 'vscode';
import { isValidLocation } from '../../../src/Coverage/Formatters/helpers';

describe('GutterFormatter', () => {
  describe('format()', () => {
    const fileCoverage: any = {};
    const coverageMapProvider: any = {
      getFileCoverage: jest.fn().mockReturnValue(fileCoverage),
    };
    const editor: any = {
      setDecorations: jest.fn(),
      document: {
        fileName: 'targetfile.ts',
        lineCount: 10,
      },
    };
    const context: any = {
      asAbsolutePath: (path: string) => path,
    };

    let sut;
    beforeEach(() => {
      sut = new GutterFormatter(context, coverageMapProvider);
      sut.computeFormatting = jest.fn().mockReturnValue({
        covered: [],
        partiallyCovered: [],
        uncovered: [],
      });
    });

    it('should do nothing when the file coverage is not found', () => {
      coverageMapProvider.getFileCoverage.mockReturnValueOnce();
      sut.format(editor);

      expect(sut.computeFormatting).not.toBeCalled();
    });

    it('should get the file coverage from the coverage provider', () => {
      sut.format(editor);

      expect(coverageMapProvider.getFileCoverage).toBeCalledWith(editor.document.fileName);
    });

    it('should add the coverage', () => {
      editor.setDecorations.mockClear();
      sut.format(editor);

      expect(sut.computeFormatting).toBeCalledWith(editor, fileCoverage);
      expect(editor.setDecorations).toHaveBeenCalledTimes(3);
    });
  });

  describe('computeFormatting()', () => {
    it('should do nothing when the branch has been hit', () => {
      const coverageMapProvider: any = {};
      const context: any = {
        asAbsolutePath: (path: string) => path,
      };
      const sut = new GutterFormatter(context, coverageMapProvider);

      const editor: any = {
        setDecorations: jest.fn(),
        document: {
          lineCount: 10,
        },
      };
      const fileCoverage: any = {
        getUncoveredLines: () => ['1', '10'],
        b: {
          0: [1],
        },
        branchMap: {
          0: {
            locations: [{}],
          },
        },
      };
      const actual = sut.computeFormatting(editor, fileCoverage);

      expect(actual.partiallyCovered).toEqual([]);
    });

    it('should do nothing when the branch location is not valid', () => {
      (isValidLocation as jest.Mock<any>).mockReturnValueOnce(false);

      const coverageMapProvider: any = {};
      const context: any = {
        asAbsolutePath: (path: string) => path,
      };
      const sut = new GutterFormatter(context, coverageMapProvider);

      const editor: any = {
        setDecorations: jest.fn(),
        document: {
          lineCount: 10,
        },
      };
      const fileCoverage: any = {
        getUncoveredLines: () => ['1', '10'],
        b: {
          0: [0],
        },
        branchMap: {
          0: {
            locations: [{}],
          },
        },
      };
      const actual = sut.computeFormatting(editor, fileCoverage);

      expect(actual.partiallyCovered).toEqual([]);
    });

    it('should reindex the line numbers for partially covered', () => {
      (isValidLocation as jest.Mock<any>).mockReturnValueOnce(true);

      const coverageMapProvider: any = {};
      const editor: any = {
        setDecorations: jest.fn(),
        document: {
          lineCount: 10,
        },
      };
      const context: any = {
        asAbsolutePath: (path: string) => path,
      };

      const fileCoverage: any = {
        getUncoveredLines: () => ['1', '10'],
        b: {
          0: [0],
        },
        branchMap: {
          0: {
            locations: [
              {
                start: {
                  line: 2,
                  column: 2,
                },
                end: {
                  line: 6,
                  column: 3,
                },
              },
            ],
          },
        },
      };

      const sut = new GutterFormatter(context, coverageMapProvider);
      const actual = sut.computeFormatting(editor, fileCoverage);

      expect(actual.partiallyCovered).toEqual([new vscode.Range(1, 2, 5, 3)]);
    });

    it('should add decorations with the reindexed ranges', () => {
      (isValidLocation as jest.Mock<any>).mockReturnValueOnce(true).mockReturnValueOnce(true);

      const coverageMapProvider: any = {};
      const editor: any = {
        setDecorations: jest.fn(),
        document: {
          lineCount: 10,
        },
      };
      const context: any = {
        asAbsolutePath: (path: string) => path,
      };

      const location = {
        start: {
          line: 2,
          column: 2,
        },
        end: {
          line: 6,
          column: 3,
        },
      };
      const fileCoverage: any = {
        getUncoveredLines: () => ['1', '10'],
        b: {
          0: [0],
        },
        branchMap: {
          0: {
            locations: [location, location],
          },
        },
      };

      const sut = new GutterFormatter(context, coverageMapProvider);
      const actual = sut.computeFormatting(editor, fileCoverage);

      expect(actual.partiallyCovered).toEqual([new vscode.Range(1, 2, 5, 3)]);
    });

    it('should reindex the line numbers for uncovered', () => {
      const coverageMapProvider: any = {};
      const editor: any = {
        setDecorations: () => ({}),
        document: {
          lineCount: 10,
        },
      };
      const context: any = {
        asAbsolutePath: (path: string) => path,
      };
      const fileCoverage: any = {
        getUncoveredLines: () => [1, 10],
        b: {},
        branchMap: {},
      };

      const sut = new GutterFormatter(context, coverageMapProvider);
      const actual = sut.computeFormatting(editor, fileCoverage);

      expect(actual.uncovered).toEqual([
        new vscode.Range(0, 0, 0, 0),
        new vscode.Range(9, 0, 9, 0),
      ]);
    });
  });

  describe('clear()', () => {
    it('should clear the overlay', () => {
      const coverageMapProvider: any = {};
      const editor: any = {
        setDecorations: jest.fn(),
        document: {
          lineCount: 10,
        },
      };
      const context: any = {
        asAbsolutePath: (path: string) => path,
      };

      const sut = new GutterFormatter(context, coverageMapProvider);
      sut.clear(editor);

      // All decoration types are removed by calling setDecorations with an
      // empty range
      expect(editor.setDecorations).toHaveBeenCalledTimes(3);
      for (const args of editor.setDecorations.mock.calls) {
        expect(args.length).toBe(2);
        expect(args[1]).toEqual([]);
      }
    });
  });
});
