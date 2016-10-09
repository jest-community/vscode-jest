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
    // commands.registerCommand('eslint.showOutputChannel', () => { client.outputChannel.show(); }),
    let channel = vscode.window.createOutputChannel("Jest")

    // if (shouldStartOnActivate()) {
        console.log("Starting")
        extensionInstance = new JestExt(channel, )
        extensionInstance.startProcess()
    // }
    
    context.subscriptions.push(disposable)
}

class JestExt  {
    private jestProcess: JestRunner;
    private channel: vscode.OutputChannel;

    public constructor(outputChannel: vscode.OutputChannel) {
        this.channel = outputChannel
    }

    startProcess() {
        this.jestProcess = new JestRunner();

        this.jestProcess.on('debuggerComplete', () => {
            console.log("Closed")
        }).on('executableJSON', (data: any) => {
            console.log("JSON  ] " + JSON.stringify(data))

        }).on('executableOutput', (output: string) => {
            console.log("Output] " + output)
            
            if (!output.includes("Watch Usage")){
                this.channel.appendLine(output)
            }
        }).on('executableStdErr', (error: Buffer) => {
            this.channel.appendLine(error.toString())
        }).on('nonTerminalError', (error: string) => {
            console.log("Err?  ] " + error.toString())
        }).on('exception', result => {
            console.log("\nException raised: [" + result.type + "]: " + result.message + "\n",'stderr');
        }).on('terminalError', (error: string) => {
            console.log("\nException raised: " + error);
        });
    }

    recievedResults(results: any) {
        if(results.success) {
            console.log("Passed")
        } else {
            console.log("Failed")
        }
    }
}

export function deactivate() {}