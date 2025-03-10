jest.unmock('../src/terminal-link-provider');

import * as vscode from 'vscode';
import {
  ExecutableTerminalLinkProvider,
  ExecutableLinkScheme,
} from '../src/terminal-link-provider';

describe('ExecutableTerminalLinkProvider', () => {
  let provider: ExecutableTerminalLinkProvider;

  beforeEach(() => {
    provider = new ExecutableTerminalLinkProvider();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('register', () => {
    vscode.window.registerTerminalLinkProvider = jest.fn().mockReturnValueOnce('disposable');
    expect(provider.register()).toEqual('disposable');
    expect(vscode.window.registerTerminalLinkProvider).toHaveBeenCalledWith(provider);
  });
  describe('handleTerminalLink', () => {
    it('should execute the command with the correct arguments', async () => {
      const link: any = {
        data: 'whatever',
      };
      // with args
      vscode.Uri.parse = jest.fn().mockReturnValueOnce({
        authority: 'folderName',
        path: '/command',
        query: encodeURIComponent(JSON.stringify({ arg1: 'value1', arg2: 'value2' })),
      });
      await provider.handleTerminalLink(link);
      expect(vscode.commands.executeCommand).toHaveBeenCalledWith('command', 'folderName', {
        arg1: 'value1',
        arg2: 'value2',
      });

      // without args
      vscode.Uri.parse = jest.fn().mockReturnValueOnce({
        authority: 'folderName',
        path: '/command',
      });
      await provider.handleTerminalLink(link);
      expect(vscode.commands.executeCommand).toHaveBeenCalledWith(
        'command',
        'folderName',
        undefined
      );
    });

    it('should show an error message if the link cannot be parsed', async () => {
      const link: any = {
        data: 'whatever',
      };
      vscode.Uri.parse = jest.fn().mockImplementationOnce(() => {
        throw new Error('uri parse error');
      });
      await provider.handleTerminalLink(link);

      expect(vscode.window.showErrorMessage).toHaveBeenCalledWith(
        expect.stringContaining('Failed to handle link "whatever"')
      );
    });
  });

  describe('provideTerminalLinks', () => {
    it('should return an empty array if there are no links in the line', () => {
      const context: any = {
        line: 'some text without links',
      };
      const links = provider.provideTerminalLinks(context, undefined);
      expect(links).toEqual([]);
    });

    it('should return an array of links if there are links in the line', () => {
      const context: any = {
        line: `some text with a link ${ExecutableLinkScheme}://folderName/command?${encodeURIComponent(
          JSON.stringify({ arg1: 'value1', arg2: 'value2' })
        )} and another link ${ExecutableLinkScheme}://folderName/other-command`,
      };
      const links = provider.provideTerminalLinks(context, undefined);
      expect(links).toEqual([
        {
          startIndex: 22,
          length: 92,
          tooltip: 'execute command',
          data: `${ExecutableLinkScheme}://folderName/command?${encodeURIComponent(
            JSON.stringify({ arg1: 'value1', arg2: 'value2' })
          )}`,
        },
        {
          startIndex: 132,
          length: 38,
          tooltip: 'execute command',
          data: `${ExecutableLinkScheme}://folderName/other-command`,
        },
      ]);
    });
    it('would returns empty array when match encountered error', () => {
      const originalMatchAll = String.prototype.matchAll;
      String.prototype.matchAll = jest.fn().mockReturnValueOnce([{ index: undefined }]);
      const context: any = {
        line: `some text with a link ${ExecutableLinkScheme}://folderName/command`,
      };
      const links = provider.provideTerminalLinks(context, undefined);
      expect(links).toEqual([]);

      String.prototype.matchAll = originalMatchAll;
    });
  });

  describe('executableLink', () => {
    it.each`
      seq  | folderName       | command        | args                                    | expectedPath
      ${1} | ${'folderName'}  | ${'command'}   | ${undefined}                            | ${'//folderName/command'}
      ${2} | ${'folderName'}  | ${'command'}   | ${{ arg1: 'value 1', arg2: 'value 2' }} | ${'//folderName/command'}
      ${3} | ${'folder name'} | ${'command-1'} | ${{ arg1: 'value 1', arg2: 'value 2' }} | ${'//folder%20name/command-1'}
    `('case $seq: returns an executable link', ({ folderName, command, args, expectedPath }) => {
      const link = provider.executableLink(folderName, command, args);
      if (args) {
        const encodedArgs = encodeURIComponent(JSON.stringify(args));
        expect(link).toEqual(`${ExecutableLinkScheme}:${expectedPath}?${encodedArgs}`);
      } else {
        expect(link).toEqual(`${ExecutableLinkScheme}:${expectedPath}`);
      }
    });
  });
});
