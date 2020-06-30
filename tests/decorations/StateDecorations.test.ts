jest.unmock('../../src/decorations/StateDecorations');

jest.mock('vscode', () => {
  return {
    DecorationRangeBehavior: {
      ClosedClosed: {},
    },
    OverviewRulerLane: {
      Left: {},
    },
    window: {
      createTextEditorDecorationType: jest.fn(jest.fn),
    },
  };
});
jest.mock('../../src/decorations/prepareIcon', () => ({
  default: (icon) => icon,
}));

import * as vscode from 'vscode';
import { StateDecorations } from '../../src/decorations/StateDecorations';

const defaultContextMock = {
  asAbsolutePath: (name: string) => name,
} as vscode.ExtensionContext;

function testStatusStyle(property: string) {
  it('should be decoration', () => {
    const mock = (vscode.window.createTextEditorDecorationType as unknown) as jest.Mock;
    mock.mockReturnValue(property);

    const decorations = new StateDecorations(defaultContextMock);

    expect(decorations[property]).toBe(mock());
  });

  it('should have been created with proper attributes', () => {
    const mock = (vscode.window.createTextEditorDecorationType as unknown) as jest.Mock;
    mock.mockImplementation((args) => args);

    const decoration = new StateDecorations(defaultContextMock)[property];

    expect(decoration.rangeBehavior).toBe(vscode.DecorationRangeBehavior.ClosedClosed);
    expect(decoration.overviewRulerLane).toBe(vscode.OverviewRulerLane.Left);
    expect(decoration.overviewRulerColor).toBeTruthy();
    expect(decoration.gutterIconPath).toBeTruthy();
    expect(decoration.dark.gutterIconPath).toBeTruthy();
    expect(decoration.light.gutterIconPath).toBeTruthy();
  });
}

describe('Decorations', () => {
  it('is initializing a class with public fields and methods', () => {
    const decorations = new StateDecorations(defaultContextMock);

    expect(decorations).toBeInstanceOf(StateDecorations);
  });

  describe('passing', () => {
    testStatusStyle('passing');
  });

  describe('failing', () => {
    testStatusStyle('failing');
  });

  describe('skip', () => {
    testStatusStyle('skip');
  });

  describe('unknown', () => {
    testStatusStyle('unknown');
  });

  describe('failingAssertionStyle', () => {
    const decorations = new StateDecorations(defaultContextMock);
    const failingAssertionStyle = (...args) =>
      decorations['failingAssertionStyle'].call(decorations, ...args);

    it('should create text editor decoration', () => {
      const mock = (vscode.window.createTextEditorDecorationType as unknown) as jest.Mock;
      mock.mockReset();
      const decoration = failingAssertionStyle('');

      expect(mock).toHaveBeenCalledTimes(1);
      expect(mock.mock.calls[0][0].overviewRulerLane).toBe(vscode.OverviewRulerLane.Left);
      expect(decoration).toBe(mock({}));
    });

    it('should add text to decoration', () => {
      const mock = (vscode.window.createTextEditorDecorationType as unknown) as jest.Mock;
      mock.mockReset();
      failingAssertionStyle('test text');

      expect(mock.mock.calls[0][0].light.after.contentText).toBe(' // test text');
      expect(mock.mock.calls[0][0].dark.after.contentText).toBe(' // test text');
    });
  });
});
