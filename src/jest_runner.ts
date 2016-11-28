'use strict';

import * as childProcess from 'child_process';
import {readFile} from 'fs';
import {EventEmitter} from 'events';
import {workspace} from 'vscode';

// This class represents the running process, and
// passes out events when it understands what data is being
// pass sent out of the process

export class JestRunner extends EventEmitter {
    private debugprocess: childProcess.ChildProcess;

    start() {
        var runtimeExecutable: string;
        var runtimeArgs = ['--json', '--useStderr', '--watch', '--colors', 'false', "--jsonOutputFile", "/tmp/vscode-jest.json"];

        const jestSettings = workspace.getConfiguration("jest");
        runtimeExecutable = jestSettings["pathToJest"];
        
        var processCwd = workspace.rootPath;
        var processEnv = process.env;
        
        this.debugprocess = childProcess.spawn(runtimeExecutable, runtimeArgs, {cwd: processCwd, env: processEnv});

        this.debugprocess.stdout.on('data', (data: Buffer) => {
            // Make jest save to a file, otherwise we get chunked data and it can be hard to put it back together
            let stringValue = data.toString().replace(/\n$/, "").trim();
            if (stringValue.startsWith("Test results written to")) {
                readFile("/tmp/vscode-jest.json", "utf8", (err, data) => {
                    if (err) {
                        this.emit('terminalError', "JSON test overview file not found at /tmp/vscode-jest.json"); 
                    }
                    else { this.emit('executableJSON', JSON.parse(data)); }
                });
            } else {
                this.emit('executableOutput', stringValue.replace("[2J[H", ""));
            };
        });

        this.debugprocess.stderr.on('data', (data: Buffer) => {
            this.emit('executableStdErr', data);
        });

        this.debugprocess.on('exit', () => {
            this.emit('debuggerProcessExit');
        });

        this.debugprocess.on('error', (error: Error) => {
            this.emit('terminalError', "Process failed: " + error.message);
        });

        this.debugprocess.on('close', () => {
            this.emit('debuggerProcessExit');
        });
    }

    public closeProcess() {
        this.debugprocess.kill();
    }
}
