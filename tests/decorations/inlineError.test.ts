import * as vscode from 'vscode';
import inlineError from '../../src/decorations/inlineError';

jest.unmock('../../src/decorations/inlineError');

describe('inlineError', () => {
  it('should create text editor decoration', () => {
    const mock = (vscode.window.createTextEditorDecorationType as unknown) as jest.Mock;
    mock.mockReset();
    const decoration = inlineError('');

    expect(mock).toHaveBeenCalledTimes(1);
    expect(mock.mock.calls[0][0].overviewRulerLane).toBe(vscode.OverviewRulerLane.Left);
    expect(decoration).toBe(mock({}));
  });

  it('should add text to decoration', () => {
    const mock = (vscode.window.createTextEditorDecorationType as unknown) as jest.Mock;
    mock.mockReset();
    inlineError('test text');

    expect(mock.mock.calls[0][0].light.after.contentText).toBe(' // test text');
    expect(mock.mock.calls[0][0].dark.after.contentText).toBe(' // test text');
  });
});
