'use strict';

import {basename, dirname} from 'path';
import * as net from 'net';
import * as childProcess from 'child_process';
import {EventEmitter} from 'events';
import {window, workspace} from 'vscode'

export class JestRunner extends EventEmitter {
    private debugprocess: childProcess.ChildProcess;

    constructor() {
        super();

        var runtimeArgs = ['.', '--json', '--useStderr', '--watch', '--colors', 'false', "--verbose"];
        var runtimeExecutable: string;

        runtimeExecutable = "node_modules/.bin/jest"
        
        var processCwd = workspace.rootPath
        var processEnv = {};

        //use process environment
        for( var env in process.env) {
            processEnv[env] = process.env[env];
        }
        
        this.debugprocess = childProcess.spawn(runtimeExecutable, runtimeArgs, {cwd: processCwd, env: processEnv});

        this.debugprocess.stdout.on('data', (data: Buffer) => {
            let stringValue = data.toString()
            // verify last char too?
            if (stringValue.charAt(0) == "{") {
                this.emit('executableJSON', JSON.parse(stringValue));
            } else {
                this.emit('executableOutput', stringValue);
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
           console.log("Jest Closed")
        });
    }

    // This doesn't work yet...
    public triggerFullTestSuite() {
        this.debugprocess.stdin.write("o")
    }
}
