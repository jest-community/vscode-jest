jest.unmock('../src/editor');

const vscodeProperties = {
  window: {
    activeTextEditor: jest.fn(),
    visibleTextEditors: jest.fn(),
  },
};
jest.mock('vscode', () => {
  const vscode = {
    window: {},
  };
  Object.defineProperty(vscode.window, 'visibleTextEditors', {
    get: () => vscodeProperties.window.visibleTextEditors(),
  });
  return vscode;
});

import { hasDocument, isOpenInMultipleEditors } from '../src/editor';

describe('editor', () => {
  describe('hasDocument()', () => {
    it('should return false when the editor is falsy', () => {
      const editor: any = undefined;
      expect(hasDocument(editor)).toBe(false);
    });

    it('should return false when the document is falsy', () => {
      const editor: any = {};
      expect(hasDocument(editor)).toBe(false);
    });

    it('should return true when the document is defined', () => {
      const editor: any = { document: {} };
      expect(hasDocument(editor)).toBe(true);
    });
  });

  describe('isOpenInMultipleEditors()', () => {
    const document: any = { fileName: 'fileName' };

    it('should return false when the document is falsy', () => {
      expect(isOpenInMultipleEditors(undefined)).toBe(false);
    });

    it('should return false when the document is not matched', () => {
      vscodeProperties.window.visibleTextEditors.mockReturnValueOnce([]);
      expect(isOpenInMultipleEditors(document)).toBe(false);
    });

    it('should return false when the document is open once', () => {
      vscodeProperties.window.visibleTextEditors.mockReturnValueOnce([{ document }]);
      expect(isOpenInMultipleEditors(document)).toBe(false);
    });

    it('should return true when the document is open more than once', () => {
      vscodeProperties.window.visibleTextEditors.mockReturnValueOnce([{ document }, { document }]);
      expect(isOpenInMultipleEditors(document)).toBe(true);
    });
  });
});
