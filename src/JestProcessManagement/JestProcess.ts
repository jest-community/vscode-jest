import * as vscode from 'vscode';
import { join } from 'path';
import { Runner, RunnerEvent, Options } from 'jest-editor-support';
import { JestExtContext, WatchMode } from '../JestExt/types';
import { extensionId } from '../appGlobals';
import { Logging } from '../logging';
import { JestProcessRequest } from './types';
import { requestString } from './helper';
import { removeSurroundingQuote } from '../helpers';

export const RunnerEvents: RunnerEvent[] = [
  'processClose',
  'processExit',
  'executableJSON',
  'executableStdErr',
  'executableOutput',
  'terminalError',
];

interface RunnerTask {
  promise: Promise<void>;
  resolve: () => unknown;
  reject: (reason: unknown) => unknown;
  runner: Runner;
}
export type StopReason = 'on-demand' | 'process-end';

let SEQ = 0;

export class JestProcess {
  static readonly stopHangTimeout = 500;

  private task?: RunnerTask;
  private extContext: JestExtContext;
  private logging: Logging;
  private _stopReason?: StopReason;
  private _id: string;
  public readonly request: JestProcessRequest;

  constructor(extContext: JestExtContext, request: JestProcessRequest) {
    this.extContext = extContext;
    this.request = request;
    this.logging = extContext.loggingFactory.create(`JestProcess ${request.type}`);
    this._id = `id: ${SEQ++}, request: ${requestString(request)}`;
  }

  public get stopReason(): StopReason | undefined {
    return this._stopReason;
  }
  public get id(): string {
    return this._id;
  }
  private get watchMode(): WatchMode {
    if (this.request.type === 'watch-tests') {
      return WatchMode.Watch;
    }
    if (this.request.type === 'watch-all-tests') {
      return WatchMode.WatchAll;
    }
    return WatchMode.None;
  }

  public toString(): string {
    return `JestProcess: ${this.id}; stopReason: ${this.stopReason}`;
  }
  public start(): Promise<void> {
    this._stopReason = undefined;
    return this.startRunner();
  }
  public stop(): Promise<void> {
    this._stopReason = 'on-demand';
    if (!this.task) {
      this.logging('debug', 'nothing to stop, no pending runner/promise');
      this.taskDone();
      return Promise.resolve();
    }

    this.task.runner.closeProcess();

    return this.task.promise;
  }

  private taskDone() {
    this.task = undefined;
  }

  private getReporterPath() {
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    const extensionPath = vscode.extensions.getExtension(extensionId)!.extensionPath;
    return join(extensionPath, 'out', 'reporter.js');
  }
  private quoteFileName(fileName: string): string {
    return `"${removeSurroundingQuote(fileName)}"`;
  }
  private startRunner(): Promise<void> {
    if (this.task) {
      this.logging('warn', `the runner task has already started!`);
      return this.task.promise;
    }

    const options: Options = {
      noColor: true,
      reporters: ['default', `"${this.getReporterPath()}"`],
    };

    switch (this.request.type) {
      case 'all-tests':
        if (this.request.updateSnapshot) {
          options.extraArgs = ['--updateSnapshot'];
        }
        break;
      case 'by-file':
        options.testFileNamePattern = this.quoteFileName(this.request.testFileNamePattern);
        options.extraArgs = ['--findRelatedTests'];
        if (this.request.updateSnapshot) {
          options.extraArgs.push('--updateSnapshot');
        }
        break;

      case 'by-file-test':
        options.testFileNamePattern = this.quoteFileName(this.request.testFileNamePattern);
        options.testNamePattern = this.request.testNamePattern;
        if (this.request.updateSnapshot) {
          options.extraArgs = ['--updateSnapshot'];
        }
        break;
      case 'not-test':
        delete options.reporters;
        options.args = this.request.args;
        break;
    }

    const runner = new Runner(this.extContext.runnerWorkspace, options);
    this.registerListener(runner);

    let taskInfo: Omit<RunnerTask, 'promise'>;
    const promise = new Promise<void>((resolve, reject) => {
      taskInfo = { runner, resolve, reject };
    });
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    this.task = { ...taskInfo!, promise };

    this.request.listener.onEvent(this, 'processStarting');
    runner.start(this.watchMode !== WatchMode.None, this.watchMode === WatchMode.WatchAll);

    return promise;
  }

  private eventHandler(event: RunnerEvent, ...args: unknown[]): void {
    if (event === 'processClose' || event === 'processExit') {
      this.task?.resolve();
      this.task = undefined;
      this._stopReason = this._stopReason ?? 'process-end';
    }
    this.request.listener.onEvent(this, event, ...args);
  }
  private registerListener(runner: Runner): void {
    RunnerEvents.forEach((event) =>
      runner.on(event, (...args: unknown[]) => this.eventHandler(event, ...args))
    );
  }
}
