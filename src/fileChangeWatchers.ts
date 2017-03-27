import * as vscode from 'vscode';

import { JestExt } from './JestExt';

export function registerFileChangeWatchers(jestExt: JestExt) {
	let activeEditor = vscode.window.activeTextEditor;

	return [
		vscode.window.onDidChangeActiveTextEditor(editor => {
			activeEditor = editor;
			jestExt.triggerUpdateDecorations(activeEditor);
		}),

		vscode.workspace.onDidSaveTextDocument(document => {
			if (document) {
				jestExt.triggerUpdateDecorations(activeEditor);
			}
		}),

		vscode.workspace.onDidChangeTextDocument(({ document }) => {
			if (activeEditor && document === activeEditor.document) {
				jestExt.triggerUpdateDecorations(activeEditor);
			}
		}),
	];
}
