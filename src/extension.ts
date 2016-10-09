'use strict';

import * as vscode from 'vscode';
import {shouldStartOnActivate, getPathToJest} from './utils'
import * as childProcess from 'child_process';
import {basename, dirname} from 'path';
import * as path from 'path';
import {JestRunner} from './jest_runner'

var extensionInstance: JestExt;

export function activate(context: vscode.ExtensionContext) {
    console.log('Hello world, "vscode-jest" is now active!')

    let disposable = vscode.commands.registerCommand('extension.jest.startJest', () => {
        vscode.window.showInformationMessage('Hello World!');
    })

    // if (shouldStartOnActivate()) {
        console.log("Starting")
        extensionInstance = new JestExt()
        extensionInstance.startProcess()
    // }

    context.subscriptions.push(disposable)
}

class JestExt  {
    private jestProcess: JestRunner;
    private hasRunFirstFullTestRun: boolean;

    startProcess() {
        this.jestProcess = new JestRunner({});

        this.jestProcess.on('debuggerComplete', () => {
            console.log("Closed")
        }).on('executableJSON', (data: any) => {
            console.log("JSON  ] " + JSON.stringify(data))

        }).on('executableOutput', (output: String) => {
            console.log("Output] " + output)
            if (!this.hasRunFirstFullTestRun && output.includes("Watch Usage")){
                this.hasRunFirstFullTestRun = true
                this.jestProcess.triggerFullTestSuite()
            }

        }).on('executableStdErr', (error: Buffer) => {
            console.log("Err   ] " + error.toString())
        }).on('nonTerminalError', (error: string) => {
            console.log("Err?  ] " + error.toString())
        }).on('exception', result => {
            console.log("\nException raised: [" + result.type + "]: " + result.message + "\n",'stderr');
        }).on('terminalError', (error: string) => {
            console.log("\nException raised: " + error);
        });
    }
}

export function deactivate() {}