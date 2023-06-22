jest.unmock('../../../src/Coverage/Formatters/GutterFormatter');

jest.mock('vscode', () => {
  return {
    OverviewRulerLane: {},
    Range: jest.fn(),
    Uri: {
      file: jest.fn().mockImplementation((f: string) => ({
        with: (query: object) => ({ file: f, ...query }),
      })),
    },
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

import * as vscode from 'vscode';
import { GutterFormatter } from '../../../src/Coverage/Formatters/GutterFormatter';

const makeRange = (line: number) => ({
  start: { line, character: 0 },
  end: { line, character: 0 },
});

jest.mock('../../../src/helpers', () => ({
  prepareIconFile: (icon) => icon,
}));

describe('GutterFormatter', () => {
  const mockLineCoverageRanges = jest.fn();
  const mockGetColorString = jest.fn();
  const mockSetDecorations = jest.fn();
  const coverageMapProvider: any = jest.fn();
  const context: any = {
    asAbsolutePath: (path: string) => path,
  };
  const editor: any = {
    document: {
      fileName: 'whatever',
    },
    setDecorations: mockSetDecorations,
  };

  let sut: GutterFormatter;
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('decorators', () => {
    beforeEach(() => {
      mockGetColorString.mockReturnValue('some-color');
      GutterFormatter.prototype.getColorString = mockGetColorString;

      sut = new GutterFormatter(context, coverageMapProvider);
    });
    it('will decorate gutter with an Uri differ by color', () => {
      expect(vscode.Uri.file).toHaveBeenCalledTimes(3);

      const decorations = [sut.uncoveredLine, sut.partiallyCoveredLine, sut.coveredLine];
      decorations.forEach((d) => {
        const options = (d as any).options;
        expect(options.isWholeLine).toBeFalsy();
        expect(options.backgroundColor).toBeUndefined();
        expect(options.gutterIconPath).toEqual(
          expect.objectContaining({ query: 'color=some-color' })
        );
      });
    });
    it('uncovered and partially-covered will mark overviewRuler', () => {
      const decorations = [sut.uncoveredLine, sut.partiallyCoveredLine];
      decorations.forEach((d) => {
        const options = (d as any).options;
        expect(options.OverviewRulerLane).toEqual(vscode.OverviewRulerLane.Left);
        expect(options.overviewRulerColor).toEqual('some-color');
      });
    });
    it('covered decorator does not mark overviewRuler', () => {
      const options = (sut.coveredLine as any).options;
      expect(options.OverviewRulerLane).toBeUndefined();
      expect(options.overviewRulerColor).toBeUndefined();
    });
  });
  describe('format', () => {
    beforeEach(() => {
      sut = new GutterFormatter(context, coverageMapProvider);
      sut.lineCoverageRanges = mockLineCoverageRanges;
    });

    describe('when no coverage', () => {
      beforeEach(() => {
        mockLineCoverageRanges.mockReturnValue({});
      });

      it('should clear all decorations', () => {
        sut.format(editor);
        expect(mockSetDecorations).toHaveBeenCalledTimes(3);
        expect(mockSetDecorations).toHaveBeenCalledWith(sut.uncoveredLine, []);
        expect(mockSetDecorations).toHaveBeenCalledWith(sut.partiallyCoveredLine, []);
        expect(mockSetDecorations).toHaveBeenCalledWith(sut.coveredLine, []);
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
        expect(mockSetDecorations).toHaveBeenCalledTimes(3);
        expect(mockSetDecorations).toHaveBeenCalledWith(sut.uncoveredLine, [range2]);
        expect(mockSetDecorations).toHaveBeenCalledWith(sut.partiallyCoveredLine, [range3]);
        expect(mockSetDecorations).toHaveBeenCalledWith(sut.coveredLine, [range1]);
      });
      it('can can clear decorator for the given editor', () => {
        sut.clear(editor);
        expect(mockSetDecorations).toHaveBeenCalledTimes(3);
        expect(mockSetDecorations).toHaveBeenCalledWith(sut.uncoveredLine, []);
        expect(mockSetDecorations).toHaveBeenCalledWith(sut.partiallyCoveredLine, []);
        expect(mockSetDecorations).toHaveBeenCalledWith(sut.coveredLine, []);
      });
    });

    it('can dispose decorator for all editors', () => {
      sut.dispose();
      expect(sut.uncoveredLine.dispose).toHaveBeenCalledTimes(1);
      expect(sut.partiallyCoveredLine.dispose).toHaveBeenCalledTimes(1);
      expect(sut.coveredLine.dispose).toHaveBeenCalledTimes(1);
    });
  });
});
