import * as vscode from 'vscode';

type ExecutableTerminalLink = vscode.TerminalLink & { data: string };

export const ExecutableLinkScheme = 'vscode-jest';

/**
 * provide terminal links for commands that can be executed in the terminal.
 *
 * The link data is a vscode uri with the following format:
 * vscode-jest://<folderName>/<command>?<args>
 *
 * Note the folderName, command, and args should be encoded using encodeURIComponent
 * The args should be a JSON.stringify-able object and the command should expect to receive them accordingly.
 *
 * example:
 * vscode-jest://workspace%20name/io.orta.jest.with-workspace.setup-extension
 */
export class ExecutableTerminalLinkProvider
  implements vscode.TerminalLinkProvider<ExecutableTerminalLink>
{
  async handleTerminalLink(link: ExecutableTerminalLink): Promise<void> {
    try {
      const uri = vscode.Uri.parse(link.data);
      const folderName = decodeURIComponent(uri.authority);
      const command = decodeURIComponent(uri.path).substring(1);
      const args = uri.query && JSON.parse(decodeURIComponent(uri.query));
      await vscode.commands.executeCommand(command, folderName, args);
    } catch (error) {
      vscode.window.showErrorMessage(`Failed to handle link "${link.data}": ${error}`);
    }
  }

  provideTerminalLinks(
    context: vscode.TerminalLinkContext,
    _token: vscode.CancellationToken
  ): vscode.ProviderResult<ExecutableTerminalLink[]> {
    const uriRegex = new RegExp(`${ExecutableLinkScheme}://[^\\s]+`, 'g');
    const links: ExecutableTerminalLink[] = [];
    for (const match of context.line.matchAll(uriRegex)) {
      if (match.index !== undefined) {
        links.push({
          startIndex: match.index,
          length: match[0].length,
          tooltip: 'execute command',
          data: match[0],
        });
      } else {
        // Handle the unexpected case where index is undefined
        console.error('Unexpected undefined match index');
      }
    }

    return links.length > 0 ? links : [];
  }
  register(): vscode.Disposable {
    return vscode.window.registerTerminalLinkProvider(this);
  }

  /**
   * create a link that can be executed in the terminal
   * @param folderName
   * @param command
   * @param arg any JSON.stringify-able object
   * @returns
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  public executableLink(folderName: string, command: string, arg?: any): string {
    const baseLink = `${ExecutableLinkScheme}://${encodeURIComponent(
      folderName
    )}/${encodeURIComponent(command)}`;
    if (!arg) {
      return baseLink;
    }
    const encodedQuery = encodeURIComponent(JSON.stringify(arg));
    return `${baseLink}?${encodedQuery}`;
  }
}

export const executableTerminalLinkProvider = new ExecutableTerminalLinkProvider();
