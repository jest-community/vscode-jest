'use strict';

import * as vscode from 'vscode';
import {JestTotalResults} from './extension'

export enum TestReconcilationState {
  Unknown = 1,
  KnownFail = 2,
  KnownSuccess = 3
}

// just file level for now, need a Jest release for per-test
interface TestStatus {
  file: string,
  state: TestReconcilationState
}

export class TestReconciler {
  private fileStatuses:any

  constructor() {
    this.fileStatuses = {} 
  }

  updateFileWithJestStatus(results: JestTotalResults) {
    results.testResults.forEach(file => {
       this.fileStatuses[file.name] = {
         file: file.name,
         state: this.statusToReconcilationState(file.status)
       }
    });
  }

  statusToReconcilationState(status: string): TestReconcilationState {
    switch(status){
      case "passed": return TestReconcilationState.KnownSuccess
      case "failed": return TestReconcilationState.KnownFail
      default: return TestReconcilationState.Unknown
    }
  }

  stateForTest(file:vscode.Uri, name:string): TestReconcilationState {
    const results = this.fileStatuses[file.fsPath]
    if (!results) return TestReconcilationState.Unknown
    return results.state 
  }
}