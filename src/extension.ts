'use strict';

import * as vscode from 'vscode';
import * as path from 'path';

import { ProjectWorkspace } from './lib/project_workspace';
import { JestRunner } from './lib/jest_runner';
import { JestSettings } from './lib/jest_settings';
import { TestReconciler, TestReconcilationState } from './lib/test_reconciler';
import { TestFileParser, ItBlock } from './lib/test_file_parser';
import { JestTotalResults } from './lib/types';

import * as decorations from './decorations';
import { pathToJest, pathToConfig } from './helpers';

var extensionInstance: JestExt;

// Typing the actual JSON we get from Jest's runner

export function activate(context: vscode.ExtensionContext) {
    // To make us VS Code agnostic outside of this file
    const jestPath = pathToJest();
    const configPath = pathToConfig(); 
    const workspace = new ProjectWorkspace(vscode.workspace.rootPath, jestPath, configPath);

    // Create our own console
    const channel = vscode.window.createOutputChannel("Jest");

    // We need a singleton to represent the extension
    extensionInstance = new JestExt(workspace, channel, context.subscriptions);
    extensionInstance.getSettings();

    // If we should start the process by default, do so
    const userJestSettings: any = vscode.workspace.getConfiguration("jest");
    if (userJestSettings.autoEnable) {
        extensionInstance.startProcess();
    } else {
        channel.appendLine("Skipping initial Jest runner process start.");
    }

    // Register for commands   
    vscode.commands.registerCommand("io.orta.show-jest-output", () => {
        channel.show();
    });
    vscode.commands.registerTextEditorCommand("io.orta.jest.start", ()=> {
        vscode.window.showInformationMessage("Started Jest, press escape to hide this message.");
        extensionInstance.startProcess();
    });

    vscode.commands.registerTextEditorCommand("io.orta.jest.stop", ()=> {
        extensionInstance.stopProcess();
    });

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

    vscode.workspace.onDidSaveTextDocument(document => {
        if (document) {
            extensionInstance.triggerUpdateDecorations(vscode.window.activeTextEditor);
        }
    });

    vscode.workspace.onDidChangeTextDocument(event => {
        if (activeEditor && event.document === activeEditor.document) {
            extensionInstance.triggerUpdateDecorations(activeEditor);

        }
    }, null, context.subscriptions);

}

class JestExt {
    private workspace: ProjectWorkspace;
    private jestProcess: JestRunner;
    private jestSettings: JestSettings;
    private parser: TestFileParser;
    private reconciler: TestReconciler;

    // So you can read what's going on
    private channel: vscode.OutputChannel;

    // Memory management
    private workspaceDisposal: { dispose(): any }[];
    private perFileDisposals: { dispose(): any }[];

    // The bottom status bar
    private statusBarItem: vscode.StatusBarItem;
    // The ability to show fails in the problems section
    private failDiagnostics: vscode.DiagnosticCollection;

    private passingItStyle: vscode.TextEditorDecorationType;
    private failingItStyle: vscode.TextEditorDecorationType;
    private unknownItStyle: vscode.TextEditorDecorationType;

    // We have to keep track of our inline assert fails to remove later 
    private failingAssertionDecorators: any[];

    private clearOnNextInput: boolean;

    public constructor(workspace: ProjectWorkspace, outputChannel: vscode.OutputChannel, disposal: { dispose(): any }[]) {
        this.workspace = workspace;
        this.channel = outputChannel;
        this.workspaceDisposal = disposal;
        this.perFileDisposals = [];
        this.failingAssertionDecorators = [];
        this.parser = new TestFileParser();
        this.statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left);
        this.failDiagnostics = vscode.languages.createDiagnosticCollection("Jest");
        this.clearOnNextInput = true;
        this.reconciler = new TestReconciler();
        this.jestSettings = new JestSettings(workspace);
    }

    startProcess = () => {
        // The Runner is an event emitter that handles taking the Jest
        // output and converting it into different types of data that
        // we can handle here differently.

        this.jestProcess = new JestRunner(this.workspace);

        this.jestProcess.on('debuggerComplete', () => {
            this.channel.appendLine("Closed Jest");

        }).on('executableJSON', (data: any) => {
            this.updateWithData(data);
            this.triggerUpdateDecorations(vscode.window.activeTextEditor);
            this.clearOnNextInput = true;

        }).on('executableOutput', (output: string) => {
            if (!output.includes("Watch Usage")) {
                this.channel.appendLine(output);
            }
        }).on('executableStdErr', (error: Buffer) => {
            // The "tests are done" message comes through stdErr
            // We want to use this as a marker that the console should
            // be cleared, as the next input will be from a new test run.

            if (this.clearOnNextInput) {
                this.clearOnNextInput = false;
                this.parsingTestFile = false;
                this.testsHaveStartedRunning();
            }
            const message = error.toString();
            // thanks Qix, http://stackoverflow.com/questions/25245716/remove-all-ansi-colors-styles-from-strings
            const noANSI = message.replace(/[\u001b\u009b][[()#;?]*(?:[0-9]{1,4}(?:;[0-9]{0,4})*)?[0-9A-ORZcf-nqry=><]/g, '');

            if (noANSI.includes("snapshot test failed")) {
                this.detectedSnapshotErrors();
            }

            this.channel.appendLine(noANSI);
        }).on('nonTerminalError', (error: string) => {
            this.channel.appendLine(`Recieved an error from Jest Runner: ${error.toString()}`);
        }).on('exception', result => {
            this.channel.appendLine("\nException raised: [" + result.type + "]: " + result.message + "\n");
        }).on('terminalError', (error: string) => {
            this.channel.appendLine("\nException raised: " + error);
        });

        // The theme stuff
        this.setupDecorators();
        // The bottom bar thing
        this.setupStatusBar();
        // Go!
        this.jestProcess.start();
    }

    stopProcess = () => {
        this.channel.appendLine("Closing Jest jest_runner.");
        this.jestProcess.closeProcess();
    }

    // Get the settings from Jest's JSON output
    getSettings = () => {
        this.jestSettings.getConfig(() => {
            if (this.jestSettings.jestVersionMajor < 17) {
                vscode.window.showErrorMessage("This extension relies on Jest 17+ features, it will work, but the highlighting may not work correctly.");
            }
        });
    }

    wouldJestRunURI = (uri: vscode.Uri): boolean => {
        const testRegex = new RegExp(this.jestSettings.settings.testRegex);
        const root = vscode.workspace.rootPath;
        const filePath = uri.fsPath;
        let relative = path.normalize(path.relative(root, filePath));
        // replace windows path separator with normal slash
        if (path.sep === '\\') {
            relative = relative.replace(/\\/g, '/');
        }

        const matches = relative.match(testRegex);

        return matches && matches.length > 0;
    }

    detectedSnapshotErrors = () => {
        vscode.window.showInformationMessage("Would you like to update your Snapshots?", { title: "Replace them" }).then((response) => {
            // No response == cancel
            if (response) {
                this.jestProcess.runJestWithUpdateForSnapshots(() => {
                    vscode.window.showInformationMessage("Updated Snapshots. It will show in your next test run.");
                });
            }
        });
    }

    private parsingTestFile = false;
    async triggerUpdateDecorations(editor: vscode.TextEditor) {
        // Lots of reasons to not show decorators,
        // Are you at the empty screen?
        if (!editor) { return; }
        // Are you in settings?
        if (!editor.document) { return; }
        // Is it already happening?
        if (this.parsingTestFile) { return; }
        // is it in the test regex?
        if (!this.wouldJestRunURI(editor.document.uri)) { return; }
        // OK - lets go
        this.parsingTestFile = true;

        // This makes it cheaper later down the line
        let successes: ItBlock[] = [];
        let fails: ItBlock[] = [];
        let unknowns: ItBlock[] = [];

        // Parse the current JS file
        await this.parser.run(editor.document.uri.fsPath);
        // Use the parsers it blocks for references
        const itBlocks = this.parser.itBlocks;

        // Loop through our it/test references, then ask the reconciler ( the thing 
        // that reads the JSON from Jest ) whether it has passed/failed/not ran.
        const filePath = editor.document.uri.fsPath;
        const fileState = this.reconciler.stateForTestFile(filePath);
        switch (fileState) {
            // If the file failed, then it can contain passes, fails and unknowns
            case TestReconcilationState.KnownFail:
                itBlocks.forEach(it => {
                    const state = this.reconciler.stateForTestAssertion(filePath, it.name);
                    if (state !== null) {
                        switch (state.status) {
                            case TestReconcilationState.KnownSuccess:
                                successes.push(it); break;
                            case TestReconcilationState.KnownFail:
                                fails.push(it); break;
                            case TestReconcilationState.Unknown:
                                unknowns.push(it); break;
                        }
                    } else {
                        unknowns.push(it);
                    }
                });
                break;
            // Test passed, all it's must be green
            case TestReconcilationState.KnownSuccess:
                successes = itBlocks; break;

            // We don't know, not ran probably
            case TestReconcilationState.Unknown:
                unknowns = itBlocks; break;
        };



        // Create a map for the states and styles to show inline.
        // Note that this specifically is only for dots.
        const styleMap = [
            { data: successes, style: this.passingItStyle, state: TestReconcilationState.KnownSuccess },
            { data: fails, style: this.failingItStyle, state: TestReconcilationState.KnownFail },
            { data: unknowns, style: this.unknownItStyle, state: TestReconcilationState.Unknown }
        ];
        styleMap.forEach(style => {
            let decorators = this.generateDecoratorsForJustIt(style.data, style.state);
            editor.setDecorations(style.style, decorators);
        });

        // Now we want to handle adding the error message after the failing assertion
        // so first we need to clear all assertions, this is a bit of a shame as it can flash
        // however, the API for a style in this case is not built to handle different inline texts 
        // as easily as it handles inline dots

        // Remove all of the existing line decorators
        this.failingAssertionDecorators.forEach(element => {
            editor.setDecorations(element, []);
        });
        this.failingAssertionDecorators = [];

        // Loop through all the failing "Statuses" (these are files)
        const failStatuses = this.reconciler.failedStatuses();
        failStatuses.forEach((fail) => {
            // Skip fails that aren't for this file
            if (editor.document.uri.fsPath !== fail.file) { return; }

            // Get the failed assertions
            const asserts = fail.assertions.filter((a) => a.status === TestReconcilationState.KnownFail);
            asserts.forEach((assertion) => {
                const decorator = {
                    range: new vscode.Range(assertion.line - 1, 0, 0, 0),
                    hoverMessage: assertion.terseMessage
                };
                // We have to make a new style for each unique message, this is
                // why we have to remove off of them beforehand
                const style = decorations.failingAssertionStyle(assertion.terseMessage);
                this.failingAssertionDecorators.push(style);
                editor.setDecorations(style, [decorator]);
            });
        });
        this.parsingTestFile = false;
    }

    setupStatusBar = () => {
        this.statusBarItem.show();
        this.statusBarItem.command = "io.orta.show-jest-output";

        const jestSettings = vscode.workspace.getConfiguration("jest");
        if (jestSettings["autoEnable"]) {
            this.testsHaveStartedRunning();
        } else {
            this.statusBarItem.text = "Jest: ...";
        }
    }

    setupDecorators = () => {
        this.passingItStyle = decorations.passingItName();
        this.failingItStyle = decorations.failingItName();
        this.unknownItStyle = decorations.notRanItName();
    }

    testsHaveStartedRunning = () => {
        this.channel.clear();
        this.statusBarItem.text = "Jest: $(sync)";
    }

    updateWithData = (data: JestTotalResults) => {
        this.reconciler.updateFileWithJestStatus(data);
        this.failDiagnostics.clear();

        if (data.success) {
            this.statusBarItem.text = "Jest: $(check)";

        } else {
            this.statusBarItem.text = "Jest: $(alert)";

            // We've got JSON data back from Jest about a failing test run.
            // We don't want to handle the decorators (inline dots/messages here)
            // but we can handle creating "problems" for the workspace here.

            // For each failed file
            const fails = this.reconciler.failedStatuses();
            fails.forEach((fail) => {
                // Generate a uri, and pull out the failing it/tests
                const uri = vscode.Uri.file(fail.file);
                const asserts = fail.assertions.filter((a) => a.status === TestReconcilationState.KnownFail);

                // Loop through each individual fail and create an diagnostic
                // to pass back to VS Code.
                this.failDiagnostics.set(uri, asserts.map((assertion) => {
                    const expect = this.parser.expectAtLine(assertion.line);
                    const start = expect ? expect.start.column : 0;
                    const daig = new vscode.Diagnostic(
                        new vscode.Range(assertion.line - 1, start, assertion.line - 1, start + 6),
                        assertion.terseMessage,
                        vscode.DiagnosticSeverity.Error
                    );
                    daig.source = "Jest";
                    return daig;
                }));
            });
        }
    }

    // These are the dots
    generateDecoratorsForJustIt = (blocks: ItBlock[], state: TestReconcilationState): vscode.DecorationOptions[] => {
        const nameForState = (name: string, state: TestReconcilationState): string => {
            switch (state) {
                case TestReconcilationState.KnownSuccess:
                    return 'Passed';
                case TestReconcilationState.KnownFail:
                    return 'Failed';
                case TestReconcilationState.Unknown:
                    return 'Test has not run yet, due to Jest only running tests related to changes.';
            }
        };
        return blocks.map((it) => {
            return {
                // VS Code is 1 based, babylon is 0 based
                range: new vscode.Range(it.start.line - 1, it.start.column, it.start.line - 1, it.start.column + 2),
                hoverMessage: nameForState(it.name, state),
            };
        });
    }

    deactivate = () => {
        this.jestProcess.closeProcess();
    }
}

export function deactivate() {
    extensionInstance.deactivate();
}
