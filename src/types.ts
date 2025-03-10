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

export interface StringPattern {
  value: string;
  exactMatch?: boolean;
  isRegExp?: boolean;
}

export type TestNamePattern = StringPattern | string;
export interface DebugInfo {
  testPath: string;
  useTestPathPattern?: boolean;
  testName?: TestNamePattern;
}
