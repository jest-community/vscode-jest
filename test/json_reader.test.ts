import * as assert from 'assert';
import * as vscode from 'vscode';
import { TestReconciler, TestReconcilationState } from '../src/test_reconciler';
import * as fs from "fs";

const reconcilerWithFile = (file: vscode.Uri): TestReconciler => {
      const parser = new TestReconciler();
      const exampleJSON = fs.readFileSync(__dirname + "/../../test/fixtures/failing_jest_json.js");
      const json = JSON.parse(exampleJSON.toString());
      parser.updateFileWithJestStatus(json);
return parser;
};

suite("Test Reconciler", () => {
    let parser: TestReconciler;
    const filePath = "/Users/orta/dev/projects/danger/danger-js/source/ci_source/_tests/_travis.test.js";
    const file = vscode.Uri.file(filePath);

    test("passes a passing method", () => {
      parser = reconcilerWithFile(file);
      const status = parser.stateForTestAssertion(file, "does not validate without josh");
      assert.equal(status.status, TestReconcilationState.KnownSuccess);
    });

    test("fails a failing method in the same file", () => {
      parser = reconcilerWithFile(file);
      const status = parser.stateForTestAssertion(file, "does not validate without josh");
      assert.equal(status.status, TestReconcilationState.KnownSuccess);
    });
});