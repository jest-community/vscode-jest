jest.unmock('../src/language-provider');

const vscodeMock = {
  FileType: {
    Unknown: 0,
    File: 1,
    Directory: 2,
    SymbolicLink: 64,
  },
  CompletionItemKind: {
    File: 0,
    Folder: 1,
  },
  CompletionItem: jest.fn().mockImplementation((label, kind) => ({ label, kind })),
  workspace: {
    fs: {
      readDirectory: jest.fn(),
    },
  },
  Uri: {
    file: jest.fn(),
  },
  languages: {
    registerCompletionItemProvider: jest.fn(),
  },
};
jest.mock('vscode', () => vscodeMock);

import { LocalFileCompletionItemProvider, register } from '../src/language-provider';
import * as vscode from 'vscode';
import * as path from 'path';

describe('LocalFileCompletionItemProvider', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });
  describe('can auto complete for jest module-path methods', () => {
    it.each`
      jestMethod                     | isValid
      ${'jest.mock'}                 | ${true}
      ${'jest.unmock'}               | ${true}
      ${'jest.doMock'}               | ${true}
      ${'jest.dontMock'}             | ${true}
      ${'jest.setMock'}              | ${true}
      ${'jest.requireActual'}        | ${true}
      ${'jest.requireMock'}          | ${true}
      ${'jest.createMockFromModule'} | ${true}
      ${'jest.spyOn'}                | ${false}
      ${'jest.fn'}                   | ${false}
    `('for $jestMethod', async ({ jestMethod, isValid }) => {
      const dirContent = [['file.ts', vscode.FileType.File]];
      vscodeMock.workspace.fs.readDirectory.mockResolvedValue(dirContent);
      const srcPath = path.join(path.sep, 'project-root', 'src');
      const docPath = path.join(srcPath, '__tests__', 'app.test.ts');
      const text = `${jestMethod}('../`;
      const doc: any = {
        uri: { fsPath: docPath },
        lineAt: () => ({ text }),
      };
      const pos: any = { character: text.length };
      const provider = new LocalFileCompletionItemProvider();
      const items = await provider.provideCompletionItems(doc, pos);
      if (!isValid) {
        expect(items).toBeUndefined();
      } else {
        expect(items).not.toBeUndefined();
        // resolve relative directory correctly
        expect(vscodeMock.Uri.file).toHaveBeenCalledTimes(1);
        const targetFolder = (vscodeMock.Uri.file as jest.Mocked<any>).mock.calls[0][0];
        expect(targetFolder.endsWith(srcPath)).toBeTruthy();
      }
    });
  });
  describe('will only return the vallid file/directories completion items', () => {
    it.each`
      case  | fileInfo                                    | completionItem
      ${1}  | ${['file.ts', vscode.FileType.File]}        | ${{ label: 'file', kind: vscode.CompletionItemKind.File }}
      ${2}  | ${['file.tsx', vscode.FileType.File]}       | ${{ label: 'file', kind: vscode.CompletionItemKind.File }}
      ${3}  | ${['file.jsx', vscode.FileType.File]}       | ${{ label: 'file', kind: vscode.CompletionItemKind.File }}
      ${4}  | ${['file.js', vscode.FileType.File]}        | ${{ label: 'file', kind: vscode.CompletionItemKind.File }}
      ${5}  | ${['file.json', vscode.FileType.File]}      | ${{ label: 'file.json', kind: vscode.CompletionItemKind.File }}
      ${6}  | ${['.config.json', vscode.FileType.File]}   | ${undefined}
      ${7}  | ${['file.js.save', vscode.FileType.File]}   | ${undefined}
      ${8}  | ${['dir', vscode.FileType.Directory]}       | ${{ label: 'dir', kind: vscode.CompletionItemKind.Folder }}
      ${9}  | ${['file.mjs', vscode.FileType.File]}       | ${{ label: 'file', kind: vscode.CompletionItemKind.File }}
      ${10} | ${['file.cjs', vscode.FileType.File]}       | ${{ label: 'file', kind: vscode.CompletionItemKind.File }}
      ${11} | ${['image.jpg', vscode.FileType.File]}      | ${undefined}
      ${12} | ${['webpack.config', vscode.FileType.File]} | ${undefined}
    `('case $case', async ({ fileInfo, completionItem }) => {
      vscodeMock.workspace.fs.readDirectory.mockResolvedValue([fileInfo]);
      const srcPath = path.join(path.sep, 'project-root', 'src');
      const docPath = path.join(srcPath, '__tests__', 'app.test.ts');
      const text = `jest.mock('../`;
      const doc: any = {
        uri: { fsPath: docPath },
        lineAt: () => ({ text }),
      };
      const pos: any = { character: text.length };
      const provider = new LocalFileCompletionItemProvider();
      const items = await provider.provideCompletionItems(doc, pos);
      if (!completionItem) {
        expect(items).toEqual([]);
      } else {
        expect(items[0]).toEqual(expect.objectContaining(completionItem));
      }
    });
  });
});
describe('register', () => {
  it('will register the language provider', () => {
    register();
    expect(vscodeMock.languages.registerCompletionItemProvider).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({ language: 'javascript' }),
        expect.objectContaining({ language: 'javascriptreact' }),
        expect.objectContaining({ language: 'typescript' }),
        expect.objectContaining({ language: 'typescriptreact' }),
      ]),
      expect.any(LocalFileCompletionItemProvider),
      '/'
    );
  });
});
