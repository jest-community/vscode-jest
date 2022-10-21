jest.unmock('../../src/Coverage/CoverageOverlay');

const vscodeProperties = {
  window: {
    visibleTextEditors: jest.fn(),
  },
};
jest.mock('vscode', () => {
  const vscode = {
    OverviewRulerLane: {},
    window: {
      createTextEditorDecorationType: jest.fn(),
    },
  };

  Object.defineProperty(vscode.window, 'visibleTextEditors', {
    get: () => vscodeProperties.window.visibleTextEditors(),
  });

  return vscode;
});

import { CoverageOverlay } from '../../src/Coverage/CoverageOverlay';
import { DefaultFormatter } from '../../src/Coverage/Formatters/DefaultFormatter';
import { GutterFormatter } from '../../src/Coverage/Formatters/GutterFormatter';

describe('CoverageOverlay', () => {
  const coverageMapProvider: any = {};

  describe('constructor', () => {
    it('should set the default visibility', () => {
      const sut = new CoverageOverlay(null, coverageMapProvider);

      expect(sut.enabled).toBe(CoverageOverlay.defaultVisibility);
    });

    it('should set the visibility if provided', () => {
      const enabled = !CoverageOverlay.defaultVisibility;
      const sut = new CoverageOverlay(null, coverageMapProvider, enabled);

      expect(sut.enabled).toBe(enabled);
    });

    it('should set the default overlay formatter', () => {
      const sut = new CoverageOverlay(null, coverageMapProvider);

      expect(DefaultFormatter).toHaveBeenCalledWith(coverageMapProvider, undefined);
      expect(sut.formatter).toBeInstanceOf(DefaultFormatter);
    });
    it('can be cutomized', () => {
      const colors = { covered: 'red' };
      const sut = new CoverageOverlay(null, coverageMapProvider, false, 'GutterFormatter', colors);

      expect(sut.enabled).toBe(false);
      expect(GutterFormatter).toHaveBeenCalledWith(null, coverageMapProvider, colors);
      expect(sut.formatter).toBeInstanceOf(GutterFormatter);
    });
  });

  describe('enabled', () => {
    describe('get', () => {
      it('should return the overlay visibility', () => {
        const expected = true;
        const sut = new CoverageOverlay(null, coverageMapProvider, expected);

        expect(sut.enabled).toBe(expected);
      });
    });

    describe('set', () => {
      it('should set the overlay visibility', () => {
        const expected = true;
        const sut = new CoverageOverlay(null, coverageMapProvider, !expected);
        sut.updateVisibleEditors = jest.fn();
        sut.enabled = expected;

        expect(sut.enabled).toBe(expected);
      });

      it('should refresh the overlays in visible editors', () => {
        const sut = new CoverageOverlay(null, coverageMapProvider);
        sut.updateVisibleEditors = jest.fn();
        sut.enabled = true;

        expect(sut.updateVisibleEditors).toHaveBeenCalled();
      });
    });
  });

  describe('toggleVisibility()', () => {
    it('should enable the overlay when disabled', () => {
      const enabled = false;
      const sut = new CoverageOverlay(null, coverageMapProvider, enabled);
      sut.updateVisibleEditors = jest.fn();
      sut.toggleVisibility();

      expect(sut.enabled).toBe(true);
    });

    it('should disable the overlay when enabled', () => {
      const enabled = true;
      const sut = new CoverageOverlay(null, coverageMapProvider, enabled);
      sut.updateVisibleEditors = jest.fn();
      sut.toggleVisibility();

      expect(sut.enabled).toBe(false);
    });

    it('should refresh the overlays in visible editors', () => {
      const sut = new CoverageOverlay(null, coverageMapProvider);
      sut.updateVisibleEditors = jest.fn();
      sut.toggleVisibility();

      expect(sut.updateVisibleEditors).toHaveBeenCalled();
    });
  });

  describe('updateVisibleEditors()', () => {
    it('should update each editor', () => {
      const editors = [{}, {}, {}];
      vscodeProperties.window.visibleTextEditors.mockReturnValueOnce(editors);

      const sut = new CoverageOverlay(null, coverageMapProvider);
      sut.update = jest.fn();
      sut.updateVisibleEditors();

      for (let i = 0; i < editors.length; i += 1) {
        expect((sut.update as jest.Mock<any>).mock.calls[i]).toEqual([editors[i]]);
      }
    });
  });

  describe('update()', () => {
    it('should do nothing if the editor does not have a valid document', () => {
      const sut = new CoverageOverlay(null, coverageMapProvider);

      const editor: any = {};
      sut.update(editor);

      expect(sut.formatter.format).not.toHaveBeenCalled();
      expect(sut.formatter.clear).not.toHaveBeenCalled();
    });

    it('should add the overlay when enabled', () => {
      const enabled = true;
      const sut = new CoverageOverlay(null, coverageMapProvider, enabled);

      const editor: any = { document: {} };
      sut.update(editor);

      expect(sut.formatter.format).toHaveBeenCalledWith(editor);
    });

    it('should remove the overlay when disabled', () => {
      const enabled = false;
      const sut = new CoverageOverlay(null, coverageMapProvider, enabled);

      const editor: any = { document: {} };
      sut.update(editor);

      expect(sut.formatter.clear).toHaveBeenCalledWith(editor);
    });
  });
  it('supports formatter dispose', () => {
    const sut = new CoverageOverlay(null, coverageMapProvider);
    sut.dispose();
    expect(sut.formatter.dispose).toHaveBeenCalledTimes(1);
  });
});
