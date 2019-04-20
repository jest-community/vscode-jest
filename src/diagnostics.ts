/**
 * this module contains functions to show jest test results in
 * vscode inspector via the DiagnosticsCollection.
 */
import * as vscode from 'vscode'
import { existsSync } from 'fs'
// import { DiagnosticCollection, Uri, Diagnostic, Range, DiagnosticSeverity } from 'vscode'
import { TestFileAssertionStatus } from 'jest-editor-support'
import { TestReconciliationState, TestResult } from './TestResults'

function createDiagnostic(
  uri: vscode.Uri,
  message: string,
  lineNumber: number,
  startCol = 0,
  endCol = Number.MAX_SAFE_INTEGER
): vscode.Diagnostic {
  let line = lineNumber
  if (line < 0) {
    line = 0
    // tslint:disable-next-line no-console
    console.warn(
      `received invalid line number '${line}' for '${uri.toString()}'. (most likely due to unexpected test results... you can help fix the root cause by logging an issue with a sample project to reproduce this warning)`
    )
  }
  return createDiagnosticWithRange(message, new vscode.Range(line, startCol, line, endCol))
}

function createDiagnosticWithRange(message: string, range: vscode.Range): vscode.Diagnostic {
  const diag = new vscode.Diagnostic(range, message, vscode.DiagnosticSeverity.Error)
  diag.source = 'Jest'
  return diag
}

// update diagnostics for the active editor
// it will utilize the parsed test result to mark actual text position.
export function updateCurrentDiagnostics(
  testResult: TestResult[],
  diagnostics: vscode.DiagnosticCollection,
  editor: vscode.TextEditor
) {
  const uri = editor.document.uri

  if (!testResult.length) {
    diagnostics.delete(uri)
    return
  }

  diagnostics.set(
    uri,
    testResult.map(r => {
      const line = r.lineNumberOfError || r.end.line
      const textLine = editor.document.lineAt(line)
      return createDiagnosticWithRange(r.terseMessage || r.shortMessage, textLine.range)
    })
  )
}

// update all diagnosis with jest test results
// note, this method aim to quickly lay down the diagnosis baseline.
// For performance reason, we will not parse individual file here, therefore
// will not have the actual info about text position. However when the file
// become active, it will then utilize the actual file content via updateCurrentDiagnostics()

export function updateDiagnostics(testResults: TestFileAssertionStatus[], diagnostics: vscode.DiagnosticCollection) {
  function addTestFileError(result: TestFileAssertionStatus, uri: vscode.Uri) {
    const diag = createDiagnostic(uri, result.message || 'test file error', 0, 0, 0)
    diagnostics.set(uri, [diag])
  }

  function addTestsError(result: TestFileAssertionStatus, uri: vscode.Uri) {
    const asserts = result.assertions.filter(a => a.status === TestReconciliationState.KnownFail)
    diagnostics.set(
      uri,
      asserts.map(assertion =>
        createDiagnostic(
          uri,
          assertion.terseMessage || assertion.shortMessage || assertion.message,
          assertion.line > 0 ? assertion.line - 1 : 0
        )
      )
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
