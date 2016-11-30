'use strict';

export interface JestFileResults {
    name: string;
    summary: string;
    message: string;
    status: "failed" | "passed";
    startTime:number;
    endTime:number;
    assertionResults: JestAssertionResults[];
}

export interface JestAssertionResults {
    name: string;
    title: string;
    status: "failed" | "passed";
    failureMessages: string[];
}

export interface JestTotalResults {
    success:boolean;
    startTime:number;
    numTotalTests:number;
    numTotalTestSuites:number;
    numRuntimeErrorTestSuites:number;
    numPassedTests:number;
    numFailedTests:number;
    numPendingTests:number;
    testResults: JestFileResults[];
}