/**
 * this module contains functions to show jest test results in
 * vscode inspector via the DiagnosticsCollection.
 */
import * as vscode from 'vscode'
// import { DiagnosticCollection, Uri, Diagnostic, Range, DiagnosticSeverity } from 'vscode'
import { TestFileAssertionStatus } from 'jest-editor-support'
import { TestReconciliationState } from './TestReconciliationState'

export function updateDiagnostics(testResults: TestFileAssertionStatus[], diagnostics: vscode.DiagnosticCollection) {
  function addTestFileError(result: TestFileAssertionStatus, uri: vscode.Uri) {
    const diag = new vscode.Diagnostic(
      new vscode.Range(0, 0, 0, 0),
      result.message || 'test file error',
      vscode.DiagnosticSeverity.Error
    )
    diag.source = 'Jest'
    diagnostics.set(uri, [diag])
  }
  function addTestsError(result: TestFileAssertionStatus, uri: vscode.Uri) {
    const asserts = result.assertions.filter(a => a.status === TestReconciliationState.KnownFail)
    diagnostics.set(
      uri,
      asserts.map(assertion => {
        const start = 0
        const diag = new vscode.Diagnostic(
          new vscode.Range(assertion.line - 1, start, assertion.line - 1, start + 6),
          assertion.terseMessage || assertion.shortMessage || assertion.message,
          vscode.DiagnosticSeverity.Error
        )
        diag.source = 'Jest'
        return diag
      })
    )
  }

  testResults.forEach(result => {
    const uri = vscode.Uri.file(result.file)

    switch (result.status) {
      case TestReconciliationState.KnownFail:
        if (result.assertions.length <= 0) {
          addTestFileError(result, uri)
        } else {
          addTestsError(result, uri)
        }
        break
      default:
        diagnostics.delete(uri)
        break
    }
  })
}

export function resetDiagnostics(diagnostics: vscode.DiagnosticCollection) {
  diagnostics.clear()
}
export function failedSuiteCount(diagnostics: vscode.DiagnosticCollection): number {
  let sum = 0
  diagnostics.forEach(() => sum++)
  return sum
}
