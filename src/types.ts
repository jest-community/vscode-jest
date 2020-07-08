import * as vscode from 'vscode';

export interface DecorationOptions extends vscode.DecorationOptions {
  identifier: string;
}
