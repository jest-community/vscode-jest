'use strict';

import * as childProcess from 'child_process';
import {EventEmitter} from 'events';
import {workspace} from 'vscode';
import {pathToJest} from './helpers';

// This class represents the the configuration of Jest's process
// we want to start with the defaults then override whatever they output
// the interface below can be used to show what we use, as currently the whole
// settings object will be in memory.

// Ideally anything you care about adding should have a default in the constructor
// see https://facebook.github.io/jest/docs/configuration.html for full deets

// For now, this is all we care about
interface JestConfigRepresentation {
  testRegex: string;
}

export class JestSettings extends EventEmitter {
    private debugprocess: childProcess.ChildProcess;
    settings: JestConfigRepresentation;
    
    constructor() {
      super();
      // Defaults for a project
      this.settings = {
        testRegex: "(/__tests__/.*|\\.(test|spec))\\.jsx?$"
      }; 
    }

    getConfig() {
        // It'll want to run tests, we don't want that, so tell it to run tests
        // in a non-existant folder.
        const folderThatDoesntExist = "aaskdjfbsjdhbfdhjsfjh";
        var runtimeArgs = ['--debug', folderThatDoesntExist];
        const runtimeExecutable = pathToJest();

        this.debugprocess = childProcess.spawn(runtimeExecutable, runtimeArgs, {cwd: workspace.rootPath, env: process.env});

        this.debugprocess.stdout.on('data', (data: Buffer) => {
            // Make jest save to a file, otherwise we get chunked data and it can be hard to put it back together
            const string = data.toString();
            if (string.includes("config =")) {
              const jsonString = string.split("config =").pop().split("No tests found")[0];
              this.settings = JSON.parse(jsonString);
            }
        });
    }
}