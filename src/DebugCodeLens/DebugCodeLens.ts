import * as vscode from 'vscode';
import { TestIdentifier } from '../TestResults';

export type DebugTestIdentifier = string | TestIdentifier;
export class DebugCodeLens extends vscode.CodeLens {
  readonly testIds: DebugTestIdentifier[];
  readonly document: vscode.TextDocument;

  /**
   *
   * @param document
   * @param range
   * @param fileName
   * @param testIds test name/pattern.
   *  Because a test block can have multiple test results, such as for paramertized tests (i.e. test.each/describe.each), there could be multiple debuggable candidates, thus it takes multiple test identifiers.
   *  Noite: If a test id is a string array, it should represent the hierarchiical relationship of a test structure, such as [describe-id, test-id].
   */
  constructor(
    document: vscode.TextDocument,
    range: vscode.Range,
    ...testIds: DebugTestIdentifier[]
  ) {
    super(range);
    this.document = document;
    this.testIds = testIds;
  }
}
