/**
 * this module contains functions to show jest test results in
 * vscode inspector via the DiagnosticsCollection.
 */
import * as vscode from 'vscode'
import { existsSync } from 'fs'
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
        let line: number
        if (assertion.line >= 0) {
          line = Math.max(assertion.line - 1, 0)
        } else {
          line = 0
          console.warn(
            `received invalid line number '${assertion.line}' for '${uri.toString()}'. (most likely due to unexpected test results... you can help fix the root cause by logging an issue with a sample project to reproduce this warning)`
          )
        }
        const start = 0
        const diag = new vscode.Diagnostic(
          new vscode.Range(line, start, line, start + 6),
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

  // Remove diagnostics for files no longer in existence
  const toBeDeleted = []
  diagnostics.forEach(uri => {
    if (!existsSync(uri.fsPath)) {
      toBeDeleted.push(uri)
    }
  })
  toBeDeleted.forEach(uri => {
    diagnostics.delete(uri)
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
