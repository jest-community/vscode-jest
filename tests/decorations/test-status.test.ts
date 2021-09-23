jest.unmock('../../src/decorations/test-status');

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
jest.mock('../../src/helpers', () => ({
  prepareIconFile: (icon) => icon,
}));

import * as vscode from 'vscode';
import { TestStatus } from '../../src/decorations/test-status';

const defaultContextMock = {
  asAbsolutePath: (name: string) => name,
} as vscode.ExtensionContext;

function testStatusStyle(property: string) {
  it('should be decoration', () => {
    const mock = vscode.window.createTextEditorDecorationType as unknown as jest.Mock;
    mock.mockReturnValue(property);

    const decorations = new TestStatus(defaultContextMock);

    expect(decorations[property]).toBe(mock());
  });

  it('should have been created with proper attributes', () => {
    const mock = vscode.window.createTextEditorDecorationType as unknown as jest.Mock;
    mock.mockImplementation((args) => args);

    const decoration = new TestStatus(defaultContextMock)[property];

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
    const decorations = new TestStatus(defaultContextMock);

    expect(decorations).toBeInstanceOf(TestStatus);
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
});
