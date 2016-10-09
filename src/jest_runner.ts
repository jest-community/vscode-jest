'use strict';

import {basename, dirname} from 'path';
import * as net from 'net';
import * as childProcess from 'child_process';
import {EventEmitter} from 'events';
import {window, workspace} from 'vscode'

export class JestRunner extends EventEmitter {
    private debugprocess: childProcess.ChildProcess;

    constructor(args: any) {
        super();

        // var runtimeArgs = ['--debug', '--json', '--useStderr', '--runInBand'];
        // var runtimeArgs = ['--debug', '--useStderr', '--no-watchman'];
        var runtimeArgs = ['.', '--json', '--useStderr', '--watch'];
        var runtimeExecutable: string;

        runtimeExecutable = "node_modules/.bin/jest"
        
        // var processCwd = args.cwd || dirname(args.program);
        var processCwd = workspace.rootPath
        var processEnv = {};

        //use process environment
        for( var env in process.env) {
            processEnv[env] = process.env[env];
        }

        //merge supplied environment
        for( var env in args.env) {
            processEnv[env] = args.env[env];
        }
        
        // console.log(`Running: ${runtimeExecutable} ${[...runtimeArgs, args.program, ...args.args || []].join(" ")} - ${JSON.stringify({cwd: processCwd, env: processEnv})}`)

        this.debugprocess = childProcess.spawn(runtimeExecutable, [...runtimeArgs, args.program, ...args.args || []], {cwd: processCwd, env: processEnv});


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
            this.emit('debuggerOutput', data);
        });

        this.debugprocess.stderr.on('data', (data: Buffer) => {
            this.emit('debuggerOutput', data);
        });


        this.debugprocess.stderr.on('data', (data: Buffer) => {
            this.emit('debuggerOutput', data);
        });


        this.debugprocess.on('exit', () => {
            this.emit('debuggerProcessExit');
        });

        this.debugprocess.on('error', (error: Error) => {
            this.emit('terminalError', "Process failed: " + error.message);
        });

        this.debugprocess.on('disconnect', () => {
           console.log("DDD")
        });

        this.debugprocess.on('message', () => {
           console.log("MMM")
        });

        this.debugprocess.on('close', () => {
           console.log("Jest Closed")
        });
    }

    public triggerFullTestSuite() {
        this.debugprocess.stdin.write("o")
    }
}
