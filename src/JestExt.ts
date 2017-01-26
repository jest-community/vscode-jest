import * as vscode from 'vscode';
import * as path from 'path';

import {
    Expect,
    ItBlock,
    Runner,
    Settings,
    ProjectWorkspace,
    parse,
    TestReconciler,
    JestTotalResults,
    IParseResults
} from 'jest-editor-support';

import * as decorations from './decorations';
import { IPluginSettings } from './IPluginSettings';
import * as status from './statusBar';

type TestReconcilationState = 'Unknown' |
    'KnownSuccess' |
    'KnownFail';
const TestReconcilationState = {
    Unknown: 'Unknown' as TestReconcilationState,
    KnownSuccess: 'KnownSuccess' as TestReconcilationState,
    KnownFail: 'KnownFail' as TestReconcilationState,
};

export class JestExt {
    private workspace: ProjectWorkspace;
    private jestProcess: Runner;
    private jestSettings: Settings;
    private reconciler: TestReconciler;
    private pluginSettings: IPluginSettings;

    // So you can read what's going on
    private channel: vscode.OutputChannel;

    // The ability to show fails in the problems section
    private failDiagnostics: vscode.DiagnosticCollection;

    private passingItStyle: vscode.TextEditorDecorationType;
    private failingItStyle: vscode.TextEditorDecorationType;
    private unknownItStyle: vscode.TextEditorDecorationType;

    private parsingTestFile = false;
    private parseResults: IParseResults = {
        expects: [],
        itBlocks: []
    };

    // We have to keep track of our inline assert fails to remove later 
    private failingAssertionDecorators: vscode.TextEditorDecorationType[];

    private clearOnNextInput: boolean;

    constructor(workspace: ProjectWorkspace, outputChannel: vscode.OutputChannel, pluginSettings: IPluginSettings) {
        this.workspace = workspace;
        this.channel = outputChannel;
        this.failingAssertionDecorators = [];
        this.failDiagnostics = vscode.languages.createDiagnosticCollection('Jest');
        this.clearOnNextInput = true;
        this.reconciler = new TestReconciler();
        this.jestSettings = new Settings(workspace);
        this.pluginSettings = pluginSettings;

        this.getSettings();
    }

    public startProcess() {
        // The Runner is an event emitter that handles taking the Jest
        // output and converting it into different types of data that
        // we can handle here differently.
        if (this.jestProcess) {
            this.jestProcess.closeProcess();
            delete this.jestProcess;
        }

        this.jestProcess = new Runner(this.workspace);

        this.jestProcess.on('debuggerComplete', () => {
            this.channel.appendLine('Closed Jest');
        }).on('executableJSON', (data: JestTotalResults) => {
            this.updateWithData(data);
        }).on('executableOutput', (output: string) => {
            if (!output.includes('Watch Usage')) {
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

            if (noANSI.includes('snapshot test failed')) {
                this.detectedSnapshotErrors();
            }

            this.channel.appendLine(noANSI);
        }).on('nonTerminalError', (error: string) => {
            this.channel.appendLine(`Received an error from Jest Runner: ${error.toString()}`);
        }).on('exception', result => {
            this.channel.appendLine(`\nException raised: [${result.type}]: ${result.message}\n`);
        }).on('terminalError', (error: string) => {
            this.channel.appendLine('\nException raised: ' + error);
        });

        // The theme stuff
        this.setupDecorators();
        // The bottom bar thing
        this.setupStatusBar();
        // Go!
        this.jestProcess.start();
    }

    public stopProcess() {
        this.channel.appendLine('Closing Jest jest_runner.');
        this.jestProcess.closeProcess();
        delete this.jestProcess;
        status.stopped();
    }

    private getSettings() {
        this.jestSettings.getConfig(() => {
            if (this.jestSettings.jestVersionMajor < 18) {
                vscode.window.showErrorMessage('This extension relies on Jest 18+ features, it will work, but the highlighting may not work correctly.');
            }
            this.workspace.localJestMajorVersion = this.jestSettings.jestVersionMajor;

            // If we should start the process by default, do so
            if (this.pluginSettings.autoEnable) {
                this.startProcess();
            } else {
                this.channel.appendLine('Skipping initial Jest runner process start.');
            }
        });
    }

    private detectedSnapshotErrors() {
        vscode.window.showInformationMessage('Would you like to update your Snapshots?', { title: 'Replace them' }).then((response) => {
            // No response == cancel
            if (response) {
                this.jestProcess.runJestWithUpdateForSnapshots(() => {
                    vscode.window.showInformationMessage('Updated Snapshots. It will show in your next test run.');
                });
            }
        });
    }

    public triggerUpdateDecorations(editor: vscode.TextEditor) {
        if (!this.canUpdateDecorators(editor)) { return; }

        // OK - lets go
        this.parsingTestFile = true;

        // This makes it cheaper later down the line
        let successes: Array<ItBlock> = [];
        const fails: Array<ItBlock> = [];
        let unknowns: Array<ItBlock> = [];

        // Parse the current JS file
        this.parseResults = parse(editor.document.uri.fsPath);
        // Use the parsers it blocks for references
        const { itBlocks } = this.parseResults;

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
            { data: successes, decorationType: this.passingItStyle, state: TestReconcilationState.KnownSuccess },
            { data: fails, decorationType: this.failingItStyle, state: TestReconcilationState.KnownFail },
            { data: unknowns, decorationType: this.unknownItStyle, state: TestReconcilationState.Unknown }
        ];
        styleMap.forEach(style => {
            const decorators = this.generateDotsForItBlocks(style.data, style.state);
            editor.setDecorations(style.decorationType, decorators);
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

        // We've got JSON data back from Jest about a failing test run.
        // We don't want to handle the decorators (inline dots/messages here)
        // but we can handle creating "problems" for the workspace here.

        // For each failed file
        this.reconciler.failedStatuses().forEach(fail => {
            // Generate a uri, and pull out the failing it/tests
            const uri = vscode.Uri.file(fail.file);
            const asserts = fail.assertions.filter(a => a.status === TestReconcilationState.KnownFail);

            asserts.forEach((assertion) => {
                const decorator = {
                    range: new vscode.Range(assertion.line - 1, 0, assertion.line - 1, 0),
                    hoverMessage: assertion.terseMessage
                };
                // We have to make a new style for each unique message, this is
                // why we have to remove off of them beforehand
                const style = decorations.failingAssertionStyle(assertion.terseMessage);
                this.failingAssertionDecorators.push(style);
                editor.setDecorations(style, [decorator]);
            });

            // Loop through each individual fail and create an diagnostic
            // to pass back to VS Code.
            this.failDiagnostics.set(uri, asserts.map(assertion => {
                const expect = this.expectAtLine(assertion.line);
                const start = expect ? expect.start.column - 1 : 0;
                const daig = new vscode.Diagnostic(
                    new vscode.Range(assertion.line - 1, start, assertion.line - 1, start + 6),
                    assertion.terseMessage,
                    vscode.DiagnosticSeverity.Error
                );
                daig.source = 'Jest';
                return daig;
            }));
        });

        this.parsingTestFile = false;
    }

    private canUpdateDecorators(editor: vscode.TextEditor) {
        const atEmptyScreen = !editor;
        if (atEmptyScreen) { return false; }

        const inSettings = !editor.document;
        if (inSettings) { return false; }

        if (this.parsingTestFile) { return false; }

        const isATestFile = this.wouldJestRunURI(editor.document.uri);
        return isATestFile;
    }

    private wouldJestRunURI(uri: vscode.Uri) {
        const testRegex = new RegExp(this.jestSettings.settings.testRegex);
        const root = this.pluginSettings.rootPath;
        const filePath = uri.fsPath;
        let relative = path.normalize(path.relative(root, filePath));
        // replace windows path separator with normal slash
        if (path.sep === '\\') {
            relative = relative.replace(/\\/g, '/');
        }

        const matches = relative.match(testRegex);

        return matches && matches.length > 0;
    }

    private setupStatusBar() {
        if (this.pluginSettings.autoEnable) {
            this.testsHaveStartedRunning();
        } else {
            status.initial();
        }
    }

    private setupDecorators() {
        this.passingItStyle = decorations.passingItName();
        this.failingItStyle = decorations.failingItName();
        this.unknownItStyle = decorations.notRanItName();
    }

    private testsHaveStartedRunning() {
        this.channel.clear();
        status.running();
    }

    private updateWithData(data: JestTotalResults) {
        this.reconciler.updateFileWithJestStatus(data);
        this.failDiagnostics.clear();

        if (data.success) {
            status.success();
        } else {
            status.failed();
        }

        this.triggerUpdateDecorations(vscode.window.activeTextEditor);
        this.clearOnNextInput = true;
    }

    private generateDotsForItBlocks(blocks: ItBlock[], state: TestReconcilationState): vscode.DecorationOptions[] {
        const nameForState = (_name: string, state: TestReconcilationState): string => {
            switch (state) {
                case TestReconcilationState.KnownSuccess:
                    return 'Passed';
                case TestReconcilationState.KnownFail:
                    return 'Failed';
                case TestReconcilationState.Unknown:
                    return 'Test has not run yet, due to Jest only running tests related to changes.';
            }
        };
        return blocks.map(it => {
            return {
                // VS Code is indexed starting at 0
                // jest-editor-support is indexed starting at 1
                range: new vscode.Range(it.start.line - 1, it.start.column - 1, it.start.line - 1, it.start.column + 1),
                hoverMessage: nameForState(it.name, state),
            };
        });
    }

    // When we want to show an inline assertion, the only bit of
    // data to work with is the line number from the stack trace.
    // So we need to be able to go from that to the real
    // expect data.
    private expectAtLine(line: number): null | Expect {
        return this.parseResults.expects.find((e) => e.start.line === line);
    }

    public deactivate() {
        this.jestProcess.closeProcess();
    }
}
