import * as vscode from 'vscode';

export function hasDocument(editor: vscode.TextEditor) {
  return !!editor && !!editor.document;
}

export function isOpenInMultipleEditors(document: vscode.TextDocument) {
  if (!document || !document.fileName) {
    return false;
  }

  let count = 0;
  for (const editor of vscode.window.visibleTextEditors) {
    if (editor && editor.document && editor.document.fileName === document.fileName) {
      count += 1;
    }

    if (count > 1) {
      break;
    }
  }

  return count > 1;
}
