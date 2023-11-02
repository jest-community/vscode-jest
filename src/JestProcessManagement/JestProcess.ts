import * as vscode from 'vscode';
import { join } from 'path';
import { Runner, RunnerEvent, Options } from 'jest-editor-support';
import { JestExtContext, WatchMode } from '../JestExt/types';
import { extensionId } from '../appGlobals';
import { Logging } from '../logging';
import { JestProcessInfo, JestProcessRequest, UserDataType } from './types';
import { requestString } from './helper';
import { toFilePath, removeSurroundingQuote, escapeRegExp, shellQuote } from '../helpers';

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

export class JestProcess implements JestProcessInfo {
  static readonly stopHangTimeout = 500;

  private task?: RunnerTask;
  private extContext: JestExtContext;
  private logging: Logging;
  private _stopReason?: StopReason;
  public readonly id: string;
  private desc: string;
  public readonly request: JestProcessRequest;

  constructor(
    extContext: JestExtContext,
    request: JestProcessRequest,
    public userData?: UserDataType
  ) {
    this.extContext = extContext;
    this.request = request;
    this.logging = extContext.loggingFactory.create(`JestProcess ${request.type}`);
    this.id = `${request.type}-${SEQ++}`;
    this.desc = `id: ${this.id}, request: ${requestString(request)}`;
  }

  public get stopReason(): StopReason | undefined {
    return this._stopReason;
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
    return `JestProcess: ${this.desc}; stopReason: ${this.stopReason}`;
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
    const extensionPath = vscode.extensions.getExtension(extensionId)!.extensionPath;
    return join(extensionPath, 'out', 'reporter.js');
  }
  private quoteFileName(fileName: string): string {
    return `"${toFilePath(removeSurroundingQuote(fileName))}"`;
  }
  private quoteFilePattern(aString: string): string {
    return `"${removeSurroundingQuote(aString)}"`;
  }

  private startRunner(): Promise<void> {
    if (this.task) {
      this.logging('warn', `the runner task has already started!`);
      return this.task.promise;
    }

    const options: Options = {
      noColor: false,
      reporters: ['default', `"${this.getReporterPath()}"`],
      args: { args: ['--colors'] },
    };

    const args = options.args!.args;

    switch (this.request.type) {
      case 'all-tests':
        args.push('--watchAll=false');
        if (this.request.updateSnapshot) {
          args.push('--updateSnapshot');
        }
        break;
      case 'by-file': {
        const fileName = this.quoteFileName(this.request.testFileName);
        args.push('--watchAll=false');
        if (this.request.notTestFile) {
          args.push('--findRelatedTests', fileName);
        } else {
          options.testFileNamePattern = fileName;
          args.push('--runTestsByPath');
        }
        if (this.request.updateSnapshot) {
          args.push('--updateSnapshot');
        }
        break;
      }
      case 'by-file-pattern': {
        const regex = this.quoteFilePattern(escapeRegExp(this.request.testFileNamePattern));
        args.push('--watchAll=false', '--testPathPattern', regex);
        if (this.request.updateSnapshot) {
          args.push('--updateSnapshot');
        }
        break;
      }

      case 'by-file-test': {
        options.testFileNamePattern = this.quoteFileName(this.request.testFileName);
        options.testNamePattern = shellQuote(
          escapeRegExp(this.request.testNamePattern),
          this.extContext.settings.shell.toSetting()
        );
        args.push('--runTestsByPath', '--watchAll=false');
        if (this.request.updateSnapshot) {
          args.push('--updateSnapshot');
        }
        break;
      }
      case 'by-file-test-pattern': {
        const regex = this.quoteFilePattern(escapeRegExp(this.request.testFileNamePattern));
        options.testNamePattern = shellQuote(
          escapeRegExp(this.request.testNamePattern),
          this.extContext.settings.shell.toSetting()
        );
        args.push('--watchAll=false', '--testPathPattern', regex);
        if (this.request.updateSnapshot) {
          args.push('--updateSnapshot');
        }
        break;
      }
      case 'not-test':
        delete options.reporters;
        options.args = { args: this.request.args, replace: true };
        break;
    }

    const runnerWorkspace = this.extContext.createRunnerWorkspace({
      outputFileSuffix: this.request.schedule.queue === 'blocking-2' ? '2' : undefined,
    });

    const runner = new Runner(runnerWorkspace, options);
    this.registerListener(runner);

    let taskInfo: Omit<RunnerTask, 'promise'>;
    const promise = new Promise<void>((resolve, reject) => {
      taskInfo = { runner, resolve, reject };
    });

    this.task = { ...taskInfo!, promise };

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
