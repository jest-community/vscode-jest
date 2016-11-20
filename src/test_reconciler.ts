'use strict';

import * as vscode from 'vscode';
import { JestTotalResults, JestAssertionResults } from './extension';

export enum TestReconcilationState {
  Unknown = 1,
  KnownFail = 2,
  KnownSuccess = 3
}

export interface TestFileAssertionStatus {
  file: string;
  message: string;
  status: TestReconcilationState;
  assertions: TestAssertionStatus[];
}

export interface TestAssertionStatus {
  title: string;
  status: TestReconcilationState;
  message: string;
  shortMessage: string;
}

export class TestReconciler {
  private fileStatuses:any;

  constructor() {
    this.fileStatuses = {}; 
  }

  updateFileWithJestStatus(results: JestTotalResults) {
    results.testResults.forEach(file => {
       this.fileStatuses[file.name] = {
         file: file.name,
         status: this.statusToReconcilationState(file.status),
         assertions: this.mapAssertions(file.assertionResults)
       };
    });
  }

  private mapAssertions(assertions: JestAssertionResults[]) : TestAssertionStatus[] {
    return assertions.map((assertion) => {
      return {
        status: this.statusToReconcilationState(assertion.status),
        title: assertion.title,
        message: "",
        shortMessage: "",
      };
    });
  }

  private statusToReconcilationState(status: string): TestReconcilationState {
    switch(status){
      case "passed": return TestReconcilationState.KnownSuccess;
      case "failed": return TestReconcilationState.KnownFail;
      default: return TestReconcilationState.Unknown;
    }
  }

  stateForTestFile(file:vscode.Uri): TestReconcilationState {
    const results: TestFileAssertionStatus = this.fileStatuses[file.fsPath];
    if (!results) { return TestReconcilationState.Unknown; }
    return results.status; 
  }

  stateForTestAssertion(file:vscode.Uri, name:string): TestAssertionStatus | null {
    const results: TestFileAssertionStatus = this.fileStatuses[file.fsPath];
    if (!results) { return null; }
    const assertion = results.assertions.find((a) => a.title === name );
    if (!assertion) { return null; }
    return assertion; 
  }
}