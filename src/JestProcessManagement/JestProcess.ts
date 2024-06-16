import * as vscode from 'vscode';
import { join } from 'path';
import { Runner, RunnerEvent, Options } from 'jest-editor-support';
import { JestExtContext, WatchMode } from '../JestExt/types';
import { collectCoverage } from '../JestExt/helper';
import { extensionId } from '../appGlobals';
import { Logging } from '../logging';
import { JestProcessInfo, JestProcessRequest, ProcessStatus, UserDataType } from './types';
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

let SEQ = 0;

export class JestProcess implements JestProcessInfo {
  private task?: RunnerTask;
  private extContext: JestExtContext;
  private logging: Logging;
  public readonly id: string;
  private desc: string;
  public readonly request: JestProcessRequest;
  public _status: ProcessStatus;
  private coverage: boolean | undefined;
  private autoStopTimer?: NodeJS.Timeout;

  constructor(
    extContext: JestExtContext,
    request: JestProcessRequest,
    public userData?: UserDataType
  ) {
    this.extContext = extContext;
    this.request = request;
    this.logging = extContext.loggingFactory.create(`JestProcess ${request.type}`);
    this._status = ProcessStatus.Pending;
    this.coverage = collectCoverage(this.getRequestCoverage(), this.extContext.settings);
    const extra = (this.coverage ? 'with-coverage:' : '') + `${SEQ++}`;
    this.id = `${request.type}:${extra}`;
    this.desc = `id: ${this.id}, request: ${requestString(request)}`;
  }

  public get status(): ProcessStatus {
    return this._status;
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

  public get isWatchMode(): boolean {
    return this.watchMode !== WatchMode.None;
  }

  public toString(): string {
    return `JestProcess: ${this.desc}; status: "${this.status}"`;
  }

  /**
   * To prevent zombie process, this method will automatically stops the Jest process if it is running for too long. The process will be marked as "Cancelled" and stopped.
   * Warning: This should only be called when you are certain the process should end soon, for example a non-watch mode process should end after the test results have been processed.
   * @param delay The delay in milliseconds after which the process will be considered hung and stopped. Default is 30000 milliseconds (30 seconds ).
   */
  public autoStop(delay = 30000, onStop?: (process: JestProcessInfo) => void): void {
    if (this.status === ProcessStatus.Running) {
      if (this.autoStopTimer) {
        clearTimeout(this.autoStopTimer);
      }
      this.autoStopTimer = setTimeout(() => {
        if (this.status === ProcessStatus.Running) {
          console.warn(
            `Jest Process "${this.id}": will be force closed due to the autoStop Timer (${delay} msec) `
          );
          this.stop();
          onStop?.(this);
        }
      }, delay);
    }
  }

  public stop(): Promise<void> {
    this._status = ProcessStatus.Cancelled;

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

  private getRequestCoverage(): boolean | undefined {
    if (this.request.type === 'not-test') {
      return;
    }
    // Note, we are ignoring coverage = false use-case, which doesn't exist yet, by returning undefined
    // and let the runMode to decide in createRunnerWorkspace()
    return this.request.coverage || undefined;
  }

  public start(): Promise<void> {
    if (this.status === ProcessStatus.Cancelled) {
      this.logging('warn', `the runner task has been cancelled!`);
      return Promise.resolve();
    }

    if (this.task) {
      this.logging('warn', `the runner task has already started!`);
      return this.task.promise;
    }

    this._status = ProcessStatus.Running;

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
      collectCoverage: this.coverage,
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

      clearTimeout(this.autoStopTimer);
      this.autoStopTimer = undefined;

      if (this._status !== ProcessStatus.Cancelled) {
        this._status = ProcessStatus.Done;
      }
    }
    this.request.listener.onEvent(this, event, ...args);
  }
  private registerListener(runner: Runner): void {
    RunnerEvents.forEach((event) =>
      runner.on(event, (...args: unknown[]) => this.eventHandler(event, ...args))
    );
  }
}
