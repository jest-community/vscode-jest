import { ItBlock } from 'jest-editor-support';
import * as vscode from 'vscode';
import { JestProcessInfo } from '../JestProcessManagement';
import { ContainerNode } from './match-node';

export type TestSuiteChangeReason = 'assertions-updated' | 'result-matched';
export type TestSuitChangeEvent =
  | {
      type: 'assertions-updated';
      process: JestProcessInfo;
      files: string[];
    }
  | {
      type: 'result-matched';
      file: string;
    }
  | {
      type: 'test-parsed';
      file: string;
      testContainer: ContainerNode<ItBlock>;
    };

// eslint-disable-next-line @typescript-eslint/explicit-module-boundary-types
export const createTestResultEvents = () => ({
  testListUpdated: new vscode.EventEmitter<string[] | undefined>(),
  testSuiteChanged: new vscode.EventEmitter<TestSuitChangeEvent>(),
});
export type TestResultEvents = ReturnType<typeof createTestResultEvents>;
