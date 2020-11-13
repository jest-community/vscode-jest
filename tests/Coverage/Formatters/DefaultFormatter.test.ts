jest.unmock('../../../src/Coverage/Formatters/DefaultFormatter');

jest.mock('vscode', () => {
  return {
    OverviewRulerLane: {},
    Range: jest.fn(),
    window: {
      createTextEditorDecorationType: jest
        .fn()
        .mockImplementation((options: vscode.DecorationRenderOptions) => ({
          options,
          dispose: jest.fn(),
        })),
    },
  };
});

import { DefaultFormatter } from '../../../src/Coverage/Formatters/DefaultFormatter';
import * as vscode from 'vscode';

const makeRange = (line: number) => ({
  start: { line, character: 0 },
  end: { line, character: 0 },
});

describe('DefaultFormatter', () => {
  const mockLineCoverageRanges = jest.fn();
  const mockGetColorString = jest.fn();
  const mockSetDecorations = jest.fn();
  const coverageMapProvider: any = {
    getFileCoverage: () => ({}),
  };
  const editor: any = {
    document: {
      fileName: {},
    },
    setDecorations: mockSetDecorations,
  };

  let sut: DefaultFormatter;
  beforeEach(() => {
    jest.clearAllMocks();

    sut = new DefaultFormatter(coverageMapProvider);
    sut.lineCoverageRanges = mockLineCoverageRanges;
  });

  it('will decorate inline code and overviewRuler', () => {
    mockGetColorString.mockReturnValue('some-color');
    DefaultFormatter.prototype.getColorString = mockGetColorString;

    sut = new DefaultFormatter(coverageMapProvider);
    [(sut.uncoveredLine as any).options, (sut.partiallyCoveredLine as any).options].forEach(
      (options) => {
        expect(options.isWholeLine).toBeTruthy();
        expect(options.OverviewRulerLane).toEqual(vscode.OverviewRulerLane.Left);
        expect(options.backgroundColor).toEqual('some-color');
        expect(options.overviewRulerColor).toEqual('some-color');
      }
    );
  });

  describe('when no coverage', () => {
    beforeEach(() => {
      mockLineCoverageRanges.mockReturnValue({});
    });

    it('should clear all decorations', () => {
      sut.format(editor);
      expect(mockSetDecorations).toBeCalledTimes(2);
      expect(mockSetDecorations).toHaveBeenCalledWith(sut.uncoveredLine, []);
      expect(mockSetDecorations).toHaveBeenCalledWith(sut.partiallyCoveredLine, []);
    });
  });
  describe('with coverage', () => {
    const [range1, range2, range3] = [makeRange(1), makeRange(2), makeRange(3)];
    beforeEach(() => {
      mockLineCoverageRanges.mockReturnValue({
        covered: [range1],
        uncovered: [range2],
        'partially-covered': [range3],
      });
    });
    it('should decorate uncovered and partially-covered ranges', () => {
      sut.format(editor);
      expect(mockSetDecorations).toBeCalledTimes(2);
      expect(mockSetDecorations).toHaveBeenCalledWith(sut.uncoveredLine, [range2]);
      expect(mockSetDecorations).toHaveBeenCalledWith(sut.partiallyCoveredLine, [range3]);
    });
    it('can can clear decorator for the given editor', () => {
      sut.clear(editor);
      expect(mockSetDecorations).toBeCalledTimes(2);
      expect(mockSetDecorations).toHaveBeenCalledWith(sut.uncoveredLine, []);
      expect(mockSetDecorations).toHaveBeenCalledWith(sut.partiallyCoveredLine, []);
    });
  });

  it('can dispose decorator for all editors', () => {
    sut.dispose();
    expect(sut.uncoveredLine.dispose).toBeCalledTimes(1);
    expect(sut.partiallyCoveredLine.dispose).toBeCalledTimes(1);
  });
});
