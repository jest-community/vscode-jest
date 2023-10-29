import * as vscode from 'vscode';
import { JestExtOutput, JestOutputTerminal, OutputOptions } from '../JestExt/output-terminal';
import { JestTestProviderContext } from './test-provider-context';

export type TestRunProtocol = Pick<
  vscode.TestRun,
  'name' | 'enqueued' | 'started' | 'errored' | 'failed' | 'passed' | 'skipped' | 'end'
>;

export type CreateRun = (name: string) => vscode.TestRun;
export type EndProcessOption = { pid: string; delay?: number; reason?: string };
export type EndOption = EndProcessOption | { reason: string };
const isEndProcessOption = (arg?: EndOption): arg is EndProcessOption =>
  arg != null && 'pid' in arg;
let SEQ = 0;

/**
 * A wrapper class for vscode.TestRun to support
 * 1. JIT creation of TestRun
 * 2. delayed end of TestRun (to prevent the TestRun from being closed before the test is completely done)
 * 3. allow multiple processes to use the same TestRun. And the TestRun will be closed only when all processes are done.
 */
export class JestTestRun implements JestExtOutput, TestRunProtocol {
  private output: JestOutputTerminal;
  private _run?: vscode.TestRun;
  private processes: Map<string, NodeJS.Timeout | undefined>;
  private verbose: boolean;
  private runCount = 0;
  public readonly name: string;

  constructor(
    name: string,
    private context: JestTestProviderContext,
    private createRun: CreateRun
  ) {
    this.name = `${this.context.ext.workspace.name}:${name}:${SEQ++}`;
    this.output = context.output;
    this.processes = new Map();
    this.verbose = context.ext.settings.debugMode === true;
  }
  write(msg: string, opt?: OutputOptions): string {
    const text = this.output.write(msg, opt);
    this._run?.appendOutput(text);
    return text;
  }

  isClosed(): boolean {
    return !this._run;
  }

  public addProcess(pid: string): void {
    if (!this.processes.has(pid)) {
      this.processes.set(pid, undefined);
    }
  }
  /**
   * returns the underlying vscode.TestRun, if existing.
   * If no run then create one with this.createRun and return it.
   **/
  private safeRun(): vscode.TestRun {
    if (!this._run) {
      const runName = `${this.name} (${this.runCount++})`;
      this._run = this.createRun(runName);
      if (this.verbose) {
        if (this.runCount > 1) {
          console.warn(
            `JestTestRun "${this.name}": Recreating a TestRun for the same instance should not happen.`
          );
        } else {
          console.log(`[${this.context.ext.workspace.name}] JestTestRun "${runName}": created.`);
        }
      }
    }
    return this._run;
  }

  // TestRunProtocol
  public enqueued = (test: vscode.TestItem): void => {
    this.safeRun().enqueued(test);
  };
  public started = (test: vscode.TestItem): void => {
    this.safeRun().started(test);
  };
  public errored = (
    test: vscode.TestItem,
    message: vscode.TestMessage | readonly vscode.TestMessage[],
    duration?: number | undefined
  ): void => {
    const _msg = this.context.ext.settings.runMode.config.showInlineError ? message : [];
    this.safeRun().errored(test, _msg, duration);
  };
  public failed = (
    test: vscode.TestItem,
    message: vscode.TestMessage | readonly vscode.TestMessage[],
    duration?: number | undefined
  ): void => {
    const _msg = this.context.ext.settings.runMode.config.showInlineError ? message : [];
    this.safeRun().failed(test, _msg, duration);
  };
  public passed = (test: vscode.TestItem, duration?: number | undefined): void => {
    this.safeRun().passed(test, duration);
  };
  public skipped = (test: vscode.TestItem): void => {
    this.safeRun().skipped(test);
  };
  public end = (options?: EndOption): void => {
    if (!this._run) {
      return;
    }
    const runName = this._run.name;
    if (isEndProcessOption(options)) {
      const { pid, delay, reason } = options;
      let timeoutId = this.processes.get(pid);
      if (timeoutId) {
        clearTimeout(timeoutId);
      }

      if (!delay) {
        this.processes.delete(pid);
        if (this.verbose) {
          console.log(`JestTestRun "${runName}": process "${pid}" ended because: ${reason}.`);
        }
      } else {
        timeoutId = setTimeout(() => {
          if (this.verbose) {
            console.log(
              `JestTestRun "${runName}": process "${pid}" ended after ${delay} msec delay because: ${reason}.`
            );
          }
          this.processes.delete(pid);
          this.end({
            reason: `last process "${pid}" ended after ${delay} msec delay because: ${reason}.`,
          });
        }, delay);
        this.processes.set(pid, timeoutId);
        if (this.verbose) {
          console.log(
            `JestTestRun "${runName}": starting a ${delay} msec timer to end process "${pid}" because: ${reason}.`
          );
        }
      }
    }
    // close the run only when all processes are done
    if (this.processes.size > 0) {
      return;
    }
    this._run.end();
    this._run = undefined;
    if (this.verbose) {
      console.log(`JestTestRun "${runName}": ended because: ${options?.reason}.`);
    }
  };
}
