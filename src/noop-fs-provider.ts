/* istanbul ignore file */

import * as vscode from 'vscode';

/**
 * This class is a dummy file system provider, which is used to silence the default file system provider
 * behavior, such as prompting user to save the file for untitled file.
 */

export class NoOpFileSystemProvider implements vscode.FileSystemProvider {
  public static scheme = `vscode-jest-noop`;
  private _onDidChangeFile: vscode.EventEmitter<vscode.FileChangeEvent[]> =
    new vscode.EventEmitter();
  readonly onDidChangeFile: vscode.Event<vscode.FileChangeEvent[]> = this._onDidChangeFile.event;

  // All methods are no-ops
  readFile(): Uint8Array {
    return new Uint8Array();
  }
  writeFile(): void {}
  watch(): vscode.Disposable {
    return new vscode.Disposable(() => {});
  }
  stat(): vscode.FileStat {
    return { type: vscode.FileType.File, ctime: 0, mtime: 0, size: 0 };
  }
  readDirectory(): [string, vscode.FileType][] {
    return [];
  }
  createDirectory(): void {}
  delete(): void {}
  rename(): void {}
  register(): vscode.Disposable {
    return vscode.workspace.registerFileSystemProvider(NoOpFileSystemProvider.scheme, this, {
      isCaseSensitive: true,
    });
  }
}

export const noOpFileSystemProvider = new NoOpFileSystemProvider();
