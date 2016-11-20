'use strict';

import * as vscode from 'vscode';
import { basename } from 'path';
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
  terseMessage: string;
  line: number | null;
}

export class TestReconciler {
  private fileStatuses: any;
  private fails: TestFileAssertionStatus[];

  constructor() {
    this.fileStatuses = {}; 
    this.fails = [];
  }

  updateFileWithJestStatus(results: JestTotalResults) {
    results.testResults.forEach(file => {
      const status = this.statusToReconcilationState(file.status);
      const fileStatus: TestFileAssertionStatus = {
         file: file.name,
         status,
         message: file.message,
         assertions: this.mapAssertions(file.name, file.assertionResults),
       };
       this.fileStatuses[file.name] = fileStatus; 
       if (status === TestReconcilationState.KnownFail) {
         this.fails.push(fileStatus);
       }
    });
  }

  failedStatuses(): TestFileAssertionStatus[] {
    return this.fails;
  }

  private mapAssertions(filename:string, assertions: JestAssertionResults[]) : TestAssertionStatus[] {
    return assertions.map((assertion) => {
      let message = assertion.failureMessages[0];
      let short = null;
      let terse = null;
      let line = null;
      if (message) {
        short = message.split("   at", 1)[0].trim();
        terse = short.split("\n").splice(2).join("").replace("  ", " ");
        line = parseInt(message.split(basename(filename), 2)[1].split(":")[1]);
      }
      return {
        status: this.statusToReconcilationState(assertion.status),
        title: assertion.title,
        message: message,
        shortMessage: short,
        terseMessage: terse,
        line: line
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