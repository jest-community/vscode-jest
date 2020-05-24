jest.unmock('../src/decorations');
jest.mock('vscode', () => {
  return {
    DecorationRangeBehavior: {
      ClosedClosed: {},
    },
    OverviewRulerLane: {},
    window: {
      createTextEditorDecorationType: jest.fn(),
    },
  };
});

import { passingItName, failingItName, skipItName, notRanItName } from '../src/decorations';
import * as vscode from 'vscode';

function testRangeBehavior(factoryMethod: () => void) {
  it('should set the range behavior', () => {
    const mock = (vscode.window.createTextEditorDecorationType as unknown) as jest.Mock<{}>;
    mock.mockReset();
    factoryMethod();

    expect(mock.mock.calls).toHaveLength(1);
    expect(mock.mock.calls[0][0].rangeBehavior).toBe(vscode.DecorationRangeBehavior.ClosedClosed);
  });
}

describe('Test Result Annotations', () => {
  describe('Pass', () => {
    testRangeBehavior(passingItName);
  });

  describe('Fail', () => {
    testRangeBehavior(failingItName);
  });

  describe('Skip', () => {
    testRangeBehavior(skipItName);
  });

  describe('Unknown', () => {
    testRangeBehavior(notRanItName);
  });
});
