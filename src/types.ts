import * as vscode from 'vscode';

export interface DecorationOptions extends vscode.DecorationOptions {
  identifier: string;
}

export interface TestStats {
  success: number;
  fail: number;
  unknown: number;
}
export type TestStatsCategory = keyof TestStats;

export interface TestExplorerRunRequest {
  request: vscode.TestRunRequest;
  token: vscode.CancellationToken;
}
