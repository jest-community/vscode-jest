import * as vscode from 'vscode';

type ExecutableTerminalLink = vscode.TerminalLink & { data: string };

export const ExecutableLinkScheme = 'vscode-jest';
export type ExecutableLinkArgs = Record<string, string | boolean | number> | undefined;

/**
 * provide terminal links for commands that can be executed in the terminal
 * the link data is a vscode uri with the following format:
 * vscode-jest://<folderName>/<command>?<args>
 *
 * both folderName and command should be encoded using encodeURIComponent
 * if there is any args, the command should expect to receive them as an object
 *
 * example:
 * vscode-jest://workspace%20name/io.orta.jest.with-workspace.setup-extension?taskId=cmdLine
 */
export class ExecutableTerminalLinkProvider
  implements vscode.TerminalLinkProvider<ExecutableTerminalLink>
{
  async handleTerminalLink(link: ExecutableTerminalLink): Promise<void> {
    try {
      const uri = vscode.Uri.parse(link.data);
      const folderName = decodeURIComponent(uri.authority);
      const command = decodeURIComponent(uri.path).substring(1);

      let args: ExecutableLinkArgs;

      if (uri.query) {
        args = Object.fromEntries(new URLSearchParams(uri.query).entries()); // Convert query string to an object

        // Convert string values to appropriate types
        for (const [key, value] of Object.entries(args)) {
          if (value === 'true') {
            args[key] = true;
          } else if (value === 'false') {
            args[key] = false;
          } else if (!isNaN(Number(value))) {
            args[key] = Number(value);
          }
        }
      }
      await vscode.commands.executeCommand(command, folderName, args);
    } catch (error) {
      vscode.window.showErrorMessage(`Failed to execute command: ${error}`);
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
  public executableLink(folderName: string, command: string, args?: ExecutableLinkArgs): string {
    const baseLink = `${ExecutableLinkScheme}://${encodeURIComponent(
      folderName
    )}/${encodeURIComponent(command)}`;
    if (!args) {
      return baseLink;
    }
    const searchParams = new URLSearchParams();
    for (const [key, value] of Object.entries(args)) {
      searchParams.append(key, value.toString());
    }
    return baseLink + '?' + searchParams.toString();
  }
}

export const executableTerminalLinkProvider = new ExecutableTerminalLinkProvider();
