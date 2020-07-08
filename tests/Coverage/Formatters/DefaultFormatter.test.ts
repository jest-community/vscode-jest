jest.unmock('../../../src/Coverage/Formatters/DefaultFormatter');
jest.unmock('../../../src/Coverage/Formatters/AbstractFormatter');

jest.mock('vscode', () => {
  return {
    OverviewRulerLane: {},
    Range: jest.fn(),
    window: {
      createTextEditorDecorationType: jest.fn(),
    },
  };
});

import { DefaultFormatter } from '../../../src/Coverage/Formatters/DefaultFormatter';
import * as vscode from 'vscode';
import { isValidLocation } from '../../../src/Coverage/Formatters/helpers';

describe('DefaultFormatter', () => {
  describe('format()', () => {
    const fileCoverage: any = {};
    const coverageMapProvider: any = {
      getFileCoverage: jest.fn().mockReturnValue(fileCoverage),
    };
    const editor: any = {
      document: {
        fileName: {},
      },
    };

    let sut;
    beforeEach(() => {
      sut = new DefaultFormatter(coverageMapProvider);
      sut.formatBranches = jest.fn();
      sut.formatUncoveredLines = jest.fn();
    });

    it('should do nothing when the file coverage is not found', () => {
      coverageMapProvider.getFileCoverage.mockReturnValueOnce();
      sut.format(editor);

      expect(sut.formatBranches).not.toBeCalled();
      expect(sut.formatUncoveredLines).not.toBeCalled();
    });

    it('should get the file coverage from the coverage provider', () => {
      sut.format(editor);

      expect(coverageMapProvider.getFileCoverage).toBeCalledWith(editor.document.fileName);
    });

    it('should add the overlay for uncovered branches', () => {
      sut.format(editor);

      expect(sut.formatBranches).toBeCalledWith(editor, fileCoverage);
    });

    it('should add the overlay for uncovered lines', () => {
      sut.format(editor);

      expect(sut.formatUncoveredLines).toBeCalledWith(editor, fileCoverage);
    });
  });

  describe('formatBranches()', () => {
    it('should do nothing when the branch has been hit', () => {
      const coverageMapProvider: any = {};
      const sut = new DefaultFormatter(coverageMapProvider);

      const editor: any = {
        setDecorations: jest.fn(),
      };
      const fileCoverage: any = {
        b: {
          0: [1],
        },
        branchMap: {
          0: {
            locations: [{}],
          },
        },
      };
      sut.formatBranches(editor, fileCoverage);

      expect(editor.setDecorations).toBeCalledWith(undefined, []);
    });

    it('should do nothing when the branch location is not valid', () => {
      (isValidLocation as jest.Mock<any>).mockReturnValueOnce(false);

      const coverageMapProvider: any = {};
      const sut = new DefaultFormatter(coverageMapProvider);

      const editor: any = {
        setDecorations: jest.fn(),
      };
      const fileCoverage: any = {
        b: {
          0: [0],
        },
        branchMap: {
          0: {
            locations: [{}],
          },
        },
      };
      sut.formatBranches(editor, fileCoverage);

      expect(editor.setDecorations).toBeCalledWith(undefined, []);
    });

    it('should reindex the line numbers', () => {
      (isValidLocation as jest.Mock<any>).mockReturnValueOnce(true);

      const coverageMapProvider: any = {};
      const editor: any = {
        setDecorations: jest.fn(),
      };

      const fileCoverage: any = {
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

      const sut = new DefaultFormatter(coverageMapProvider);
      sut.formatBranches(editor, fileCoverage);

      expect(vscode.Range).toBeCalledWith(1, 2, 5, 3);
    });

    it('should add decorations with the reindexed ranges', () => {
      const expected = [{}, {}];
      ((vscode.Range as unknown) as jest.Mock<{}>)
        .mockReturnValueOnce(expected[0])
        .mockReturnValueOnce(expected[1]);
      (isValidLocation as jest.Mock<any>).mockReturnValueOnce(true).mockReturnValueOnce(true);

      const coverageMapProvider: any = {};
      const editor: any = {
        setDecorations: jest.fn(),
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
        b: {
          0: [0, 0],
        },
        branchMap: {
          0: {
            locations: [location, location],
          },
        },
      };

      const sut = new DefaultFormatter(coverageMapProvider);
      sut.formatBranches(editor, fileCoverage);

      expect(editor.setDecorations).toBeCalledWith(undefined, expected);
    });

    it('should handle when the end column is `null`', () => {
      (isValidLocation as jest.Mock<any>).mockReturnValueOnce(true);

      const coverageMapProvider: any = {};
      const editor: any = {
        setDecorations: jest.fn(),
      };

      const fileCoverage: any = {
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
                  line: 4,
                  column: null,
                },
              },
            ],
          },
        },
      };

      const sut = new DefaultFormatter(coverageMapProvider);
      sut.formatBranches(editor, fileCoverage);

      expect(vscode.Range).toBeCalledWith(1, 2, 3, 0);
    });
  });

  describe('formatUncoveredLines()', () => {
    it('should reindex the line numbers', () => {
      (vscode.Range as jest.Mock<vscode.Range>).mockReset();

      const coverageMapProvider: any = {};
      const editor: any = {
        setDecorations: () => ({}),
      };
      const fileCoverage: any = {
        getUncoveredLines: () => [1, 10],
      };

      const sut = new DefaultFormatter(coverageMapProvider);
      sut.formatUncoveredLines(editor, fileCoverage);

      expect(vscode.Range).toHaveBeenCalledTimes(2);
      expect((vscode.Range as jest.Mock<vscode.Range>).mock.calls).toEqual([
        [0, 0, 0, 0],
        [9, 0, 9, 0],
      ]);
    });

    it('should add decorations with the reindexed ranges', () => {
      const expected = [{}, {}];
      ((vscode.Range as unknown) as jest.Mock<{}>)
        .mockReturnValueOnce(expected[0])
        .mockReturnValueOnce(expected[1]);

      const coverageMapProvider: any = {};
      const editor: any = {
        setDecorations: jest.fn(),
      };
      const fileCoverage: any = {
        getUncoveredLines: () => [1, 10],
      };

      const sut = new DefaultFormatter(coverageMapProvider);
      sut.formatUncoveredLines(editor, fileCoverage);

      expect(editor.setDecorations).toBeCalledWith(undefined, expected);
    });
  });

  describe('clear()', () => {
    it('should clear the overlay', () => {
      const coverageMapProvider: any = {};
      const editor: any = {
        setDecorations: jest.fn(),
      };

      const sut = new DefaultFormatter(coverageMapProvider);
      sut.clear(editor);

      // Both decoration types are removed by calling setDecorations with an
      // empty range
      expect(editor.setDecorations).toHaveBeenCalledTimes(2);
      for (const args of editor.setDecorations.mock.calls) {
        expect(args.length).toBe(2);
        expect(args[1]).toEqual([]);
      }
    });
  });
});
