import * as vscode from 'vscode';
import * as path from 'path';

const JestMockModuleApi =
  /jest\.(mock|unmock|domock|dontmock|setmock|requireActual|requireMock|createMockFromModule|)\(['"](.*)/gi;
const ImportFileRegex = /^([^\\.].*)\.(json|jsx|tsx|mjs|cjs|js|ts)$/gi;

const toCompletionItem = (
  label: string,
  kind = vscode.CompletionItemKind.File,
  detail?: string
): vscode.CompletionItem => {
  const cItem = new vscode.CompletionItem(label, kind);
  cItem.detail = detail ?? label;
  return cItem;
};

/**
 * auto complete path-based parameter for jest module-related methods
 */
export class LocalFileCompletionItemProvider
  implements vscode.CompletionItemProvider<vscode.CompletionItem>
{
  public async provideCompletionItems(
    document: vscode.TextDocument,
    position: vscode.Position
  ): Promise<vscode.CompletionItem[] | null | undefined> {
    const linePrefix = document.lineAt(position).text.slice(0, position.character);
    const matched = [...linePrefix.matchAll(JestMockModuleApi)][0];
    if (!matched) {
      return undefined;
    }
    const userInput: string = Array.from(matched)[2];
    const documentDir = path.dirname(document.uri.fsPath);
    const targetDir = path.resolve(documentDir, userInput);

    const results = await vscode.workspace.fs.readDirectory(vscode.Uri.file(targetDir));

    const items: vscode.CompletionItem[] = [];
    results.forEach(([p, fType]) => {
      if (fType === vscode.FileType.Directory) {
        items.push(toCompletionItem(p, vscode.CompletionItemKind.Folder));
      } else if (fType === vscode.FileType.File) {
        const matched = [...p.matchAll(ImportFileRegex)][0];
        if (matched) {
          const [, module, ext] = matched;
          if (ext === 'json') {
            items.push(toCompletionItem(p));
          } else {
            items.push(toCompletionItem(module, vscode.CompletionItemKind.File, p));
          }
        }
      }
    });
    return items;
  }
}

export function register(): vscode.Disposable[] {
  const selector = [
    { scheme: 'file', language: 'javascript' },
    { scheme: 'file', language: 'javascriptreact' },
    { scheme: 'file', language: 'typescript' },
    { scheme: 'file', language: 'typescriptreact' },
  ];
  return [
    vscode.languages.registerCompletionItemProvider(
      selector,
      new LocalFileCompletionItemProvider(),
      '/'
    ),
  ];
}
