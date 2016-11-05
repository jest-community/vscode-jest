'use strict';

import * as vscode from 'vscode';
import {shouldStartOnActivate, getPathToJest} from './utils'
import * as childProcess from 'child_process';
import {basename, dirname} from 'path';
import * as path from 'path';
import {JestRunner} from './jest_runner'
import {TestFileParser, ItBlock} from './test_file_parser'
import * as decorations from './decorations'

var extensionInstance: JestExt;

export function activate(context: vscode.ExtensionContext) {
    let channel = vscode.window.createOutputChannel("Jest")

    console.log("Starting")
    extensionInstance = new JestExt(channel, context.subscriptions)
    extensionInstance.startProcess()

    // Setup the file change watchers
	var activeEditor = vscode.window.activeTextEditor;
	if (activeEditor) {
		extensionInstance.triggerUpdateDecorations(activeEditor);
	}

	vscode.window.onDidChangeActiveTextEditor(editor => {
		activeEditor = editor;
		if (editor) {
			extensionInstance.triggerUpdateDecorations(activeEditor);	
		}
	}, null, context.subscriptions);
	
	vscode.workspace.onDidChangeTextDocument(event => {
		if (activeEditor && event.document === activeEditor.document) {
			extensionInstance.triggerUpdateDecorations(activeEditor);
		}
	}, null, context.subscriptions);
}

class JestExt  {
    private jestProcess: JestRunner
    private parser: TestFileParser
    private channel: vscode.OutputChannel
    private workspaceDisposal: { dispose(): any }[]
    private perFileDisposals: { dispose(): any }[]
    private statusBarItem: vscode.StatusBarItem;

    private passingItStyle: vscode.TextEditorDecorationType
    private failingItStyle: vscode.TextEditorDecorationType

    public constructor(outputChannel: vscode.OutputChannel, disposal:  { dispose(): any }[]) {
        this.channel = outputChannel
        this.workspaceDisposal = disposal
        this.perFileDisposals = []
        this.parser = new TestFileParser() 
        this.statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left)
    }

    startProcess() {
        this.jestProcess = new JestRunner();

        this.jestProcess.on('debuggerComplete', () => {
            console.log("Closed")
        }).on('executableJSON', (data: any) => {
            console.log("JSON  ] ", data)
            this.updateWithData(data)

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

        this.setupDecorators()
        this.setupStatusBar()
    }

    async triggerUpdateDecorations(editor: vscode.TextEditor) {
        try {
            await this.parser.run(editor.document.uri.fsPath)
            let decorators = this.generateDecoratorsForJustIt(this.parser.itBlocks, editor)
            editor.setDecorations(this.passingItStyle,decorators)
        } catch(e) {
            return;
        }
    }

    setupStatusBar() { 
        this.statusBarItem.text = "Jest: Running"
        this.statusBarItem.show()
    }

    setupDecorators() {
        this.passingItStyle = decorations.passingItName()
        this.failingItStyle = decorations.failingItName();
    }

    updateWithData(data: any) {
        if (data.success) {
            this.statusBarItem.text = "Jest: Passed"
        } else {
            this.statusBarItem.text = "Jest: Failed"
        }
    }

    generateDecoratorsForJustIt(blocks: ItBlock[], editor: vscode.TextEditor): vscode.DecorationOptions[] {
        return blocks.map((it)=> {
            return {
                // VS Code is 1 based, babylon is 0 based
                range: new vscode.Range(it.start.line - 1, it.start.column, it.start.line - 1, it.start.column + 2),
                hoverMessage: it.name,
            }
        })
    }


    generateDecoratorsForWholeItBlocks(blocks: ItBlock[], editor: vscode.TextEditor): vscode.DecorationOptions[] {
        return blocks.map((it)=> {
            return {
                // VS Code is 1 based, babylon is 0 based
                range: new vscode.Range(it.start.line - 1, it.start.column, it.end.line - 1, it.end.column),
                hoverMessage: it.name,
            }
        })
    }

    recievedResults(results: any) {
        if(results.success) {
            console.log("Passed")
        } else {
            console.log("Failed")
        }
    }

    deactivate() {

    }
}

export function deactivate() {
    extensionInstance.deactivate()

}