jest.unmock('../../src/SnapshotCodeLens/SnapshotCodeLensProvider');

import * as vscode from 'vscode';
import { registerSnapshotCodeLens } from '../../src/SnapshotCodeLens/SnapshotCodeLensProvider';
import { Snapshot } from 'jest-editor-support';

describe('SnapshotCodeLensProvider', () => {
  const mockMetadataAsync = jest.fn();
  const mockCodeLens = jest.fn();
  beforeEach(() => {
    jest.resetAllMocks();
    (Snapshot as jest.Mocked<any>).mockReturnValue({
      getMetadataAsync: mockMetadataAsync,
    });
    (vscode as jest.Mocked<any>).CodeLens = mockCodeLens;
  });
  describe('registerSnapshotCodeLens', () => {
    it('register if enableSnapshotPreviews is not false', () => {
      const registration = registerSnapshotCodeLens(true);
      expect(registration.length > 0).toBeTruthy();
      expect(vscode.languages.registerCodeLensProvider).toBeCalled();
      expect(vscode.commands.registerCommand).toBeCalledWith(
        expect.stringContaining('snapshot.missing'),
        expect.anything()
      );
    });
    it('not register if enableSnapshotPreviews is false', () => {
      const registration = registerSnapshotCodeLens(false);
      expect(registration).toHaveLength(0);
      expect(vscode.languages.registerCodeLensProvider).not.toBeCalled();
      expect(vscode.commands.registerCommand).not.toBeCalled();
    });
  });
  describe('provideCodeLenses', () => {
    let provider;
    const snapshotMetadata = (line: number, exists = true): any => ({
      node: { loc: { start: { line } } },
      exists,
    });
    beforeEach(() => {
      registerSnapshotCodeLens(true);
      provider = (vscode.languages.registerCodeLensProvider as jest.Mocked<any>).mock.calls[0][1];
    });
    it('create codeLens for each snapshot', async () => {
      mockMetadataAsync.mockReturnValue(
        Promise.resolve([snapshotMetadata(10, true), snapshotMetadata(20, false)])
      );

      await provider.provideCodeLenses({ uri: { fsPath: 'whatever' } }, {});
      expect(mockCodeLens).toBeCalledTimes(2);

      let [, command] = mockCodeLens.mock.calls[0];
      let range = (vscode.Range as jest.Mocked<any>).mock.calls[0];
      expect(range).toEqual([9, 0, 9, 0]);
      expect(command.title).toEqual('view snapshot');

      [, command] = mockCodeLens.mock.calls[1];
      range = (vscode.Range as jest.Mocked<any>).mock.calls[1];
      expect(range).toEqual([19, 0, 19, 0]);
      expect(command.title).toEqual('snapshot missing');
    });
  });
});
