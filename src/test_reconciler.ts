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
  private passes: TestFileAssertionStatus[];

  constructor() {
    this.fileStatuses = {}; 
  }

  updateFileWithJestStatus(results: JestTotalResults) {
    this.fails = [];
    this.passes = [];

    // Loop through all files inside the report from Jest
    results.testResults.forEach(file => {
      // Did the file pass/fail?
      const status = this.statusToReconcilationState(file.status);
      // Create our own simpler representation 
      const fileStatus: TestFileAssertionStatus = {
         file: file.name,
         status,
         message: file.message,
         assertions: this.mapAssertions(file.name, file.assertionResults),
       };
       this.fileStatuses[file.name] = fileStatus; 

       if (status === TestReconcilationState.KnownFail) {
         this.fails.push(fileStatus);
       } else if(status === TestReconcilationState.KnownSuccess) { 
         this.passes.push(fileStatus);
       }
    });
  }

  failedStatuses(): TestFileAssertionStatus[] {
    return this.fails || [];
  }

  passedStatuses(): TestFileAssertionStatus[] {
    return this.passes || [];
  }

  // A failed test also contains the stack trace for an `expect`
  // we don't get this as structured data, but what we get is useful enough to make it for ourselves

  private mapAssertions(filename:string, assertions: JestAssertionResults[]) : TestAssertionStatus[] {
    // Is it jest < 17? e.g. Before I added this to the JSON
    if (!assertions) { return []; }
    
    // Change all failing assertions into structured data 
    return assertions.map((assertion) => {
      // Failure messages seems to always be an array of one item
      let message = assertion.failureMessages[0];
      let short = null;
      let terse = null;
      let line = null;
      if (message) {
        // Just the first line, with little whitespace
        short = message.split("   at", 1)[0].trim();
        // Sometimes that's not enough, tighten up the first line, remove as much whitespace as possible
        // this will show inline, so we want to show very little 
        terse = short.split("\n").splice(2).join("").replace("  ", " ").replace(/\[\d\dm/g, "").replace("Received:", " Received:").replace("Difference:", " Difference:");
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