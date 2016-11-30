'use strict';

import * as childProcess from 'child_process';
import {readFile} from 'fs';
import {tmpdir} from 'os';
import {EventEmitter} from 'events';
import {workspace} from 'vscode';
import {pathToJest} from './helpers';

// This class represents the running process, and
// passes out events when it understands what data is being
// pass sent out of the process

export class JestRunner extends EventEmitter {
    private debugprocess: childProcess.ChildProcess;

    start() {
        const runtimeExecutable = pathToJest();
        const tempJSON = tmpdir() + "/vscode-jest_runner.json";
        const [command, ...initialArgs] = runtimeExecutable.split(" ");
        const runtimeArgs = [...initialArgs, '--json', '--useStderr', '--watch', "--jsonOutputFile", tempJSON];
        
        const env = process.env;
        env["CI"] = true;

        this.debugprocess = childProcess.spawn(command, runtimeArgs,  {cwd: workspace.rootPath, env: env});

        this.debugprocess.stdout.on('data', (data: Buffer) => {
            // Make jest save to a file, otherwise we get chunked data and it can be hard to put it back together
            let stringValue = data.toString().replace(/\n$/, "").trim();
            if (stringValue.startsWith("Test results written to")) {
                readFile(tempJSON, "utf8", (err, data) => {
                    if (err) {
                        this.emit('terminalError', `JSON test overview file not found at ${tempJSON}`); 
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

    public runJestWithUpdateForSnapshots(completion: any) {
        const runtimeExecutable = pathToJest();
        const updateSnapshotProcess = childProcess.spawn(runtimeExecutable, ["--updateSnapshot"],  {cwd: workspace.rootPath, env: process.env});
        updateSnapshotProcess.on('close', () => {
            completion();
        });
    }

    public closeProcess() {
        this.debugprocess.kill();
    }
}
