'use strict';

import * as childProcess from 'child_process';
import {EventEmitter} from 'events';
import {workspace} from 'vscode';

export class JestRunner extends EventEmitter {
    private debugprocess: childProcess.ChildProcess;

    constructor() {
        super();

        var runtimeArgs = ['--json', '--useStderr', '--watch', '--colors', 'false', "--verbose"];
        var runtimeExecutable: string;

        runtimeExecutable = "node_modules/.bin/jest";
        
        var processCwd = workspace.rootPath;
        var processEnv = {};

        //use process environment
        for( var env in process.env) {
            processEnv[env] = process.env[env];
        }
        
        this.debugprocess = childProcess.spawn(runtimeExecutable, runtimeArgs, {cwd: processCwd, env: processEnv});

        this.debugprocess.stdout.on('data', (data: Buffer) => {
            // Convert to JSON and strip any trailing newlines
            let stringValue = data.toString().replace(/\n$/, "");
            if (stringValue.substr(0, 1) === "{" && stringValue.substr(-1, 1) === "}") {
                this.emit('executableJSON', JSON.parse(stringValue));
            } else {
                this.emit('executableOutput', stringValue.replace("[2J[H", ""));
            }
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
           console.log("Jest Closed");
        });
    }

    public closeProcess() {
        this.debugprocess.kill();
    }

    public triggerFullTestSuite() {
        this.debugprocess.stdin.write("a");
    }
}
