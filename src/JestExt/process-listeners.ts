import * as vscode from 'vscode';
import { JestTotalResults } from 'jest-editor-support';
import { cleanAnsi } from '../helpers';
import { JestProcess, JestProcessEvent } from '../JestProcessManagement';
import { ListenerSession, ListTestFilesCallback } from './process-session';
import { isWatchRequest, prefixWorkspace } from './helper';
import { Logging } from '../logging';
import { JestRunEvent } from './types';

export class AbstractProcessListener {
  protected session: ListenerSession;
  protected readonly logging: Logging;
  public onRunEvent: vscode.EventEmitter<JestRunEvent>;

  constructor(session: ListenerSession) {
    this.session = session;
    this.logging = session.context.loggingFactory.create(this.name);
    this.onRunEvent = session.context.onRunEvent;
  }
  protected get name(): string {
    return 'AbstractProcessListener';
  }

  onEvent(jestProcess: JestProcess, event: JestProcessEvent, ...args: unknown[]): void {
    switch (event) {
      case 'processStarting': {
        this.onProcessStarting(jestProcess);
        break;
      }
      case 'executableStdErr': {
        const data = (args[0] as Buffer).toString();
        this.onExecutableStdErr(jestProcess, cleanAnsi(data), data);
        break;
      }
      case 'executableJSON': {
        this.onExecutableJSON(jestProcess, args[0] as JestTotalResults);
        break;
      }
      case 'executableOutput': {
        const str = args[0] as string;
        this.onExecutableOutput(jestProcess, cleanAnsi(str), str);
        break;
      }
      case 'terminalError': {
        const str = args[0] as string;
        this.onTerminalError(jestProcess, cleanAnsi(str), str);
        break;
      }
      case 'processClose': {
        const [code, signal] = args as [number | null, string | null];
        this.onProcessClose(jestProcess, code ?? undefined, signal ?? undefined);
        break;
      }
      case 'processExit': {
        const [code, signal] = args as [number | null, string | null];
        this.onProcessExit(jestProcess, code ?? undefined, signal ?? undefined);
        break;
      }
      default:
        this.logging(
          'warn',
          `received unexpected event "${event}" for process:`,
          jestProcess.request
        );
    }
  }

  protected onProcessStarting(process: JestProcess): void {
    this.session.context.onRunEvent.fire({ type: 'start', process });
    this.logging('debug', `${process.request.type} onProcessStarting`);
  }
  protected onExecutableStdErr(process: JestProcess, data: string, _raw: string): void {
    this.logging('debug', `${process.request.type} onExecutableStdErr:`, data);
  }
  protected onExecutableJSON(process: JestProcess, data: JestTotalResults): void {
    this.logging('debug', `${process.request.type} onExecutableJSON:`, data);
  }
  protected onExecutableOutput(process: JestProcess, data: string, _raw: string): void {
    this.logging('debug', `${process.request.type} onExecutableOutput:`, data);
  }
  protected onTerminalError(process: JestProcess, data: string, _raw: string): void {
    this.logging('error', `${process.request.type} onTerminalError:`, data);
  }
  protected onProcessClose(_process: JestProcess, _code?: number, _signal?: string): void {
    // no default behavior...
  }
  protected onProcessExit(process: JestProcess, code?: number, signal?: string): void {
    // code = 1 is general error, usually mean the command emit error, which should already handled by other event processing, for example when jest has failed tests.
    // However, error beyond 1, usually means some error outside of the command it is trying to execute, so reporting here for debugging purpose
    // see shell error code: https://www.linuxjournal.com/article/10844
    if (code && code > 1) {
      const error = `${process.request.type} onProcessExit: process exit with code=${code}, signal=${signal}`;
      this.session.context.onRunEvent.fire({ type: 'exit', process, error });
      this.logging('debug', `${error} :`, process.toString());
    } else {
      this.session.context.onRunEvent.fire({ type: 'exit', process });
    }
  }
}

const JsonArrayRegexp = /^\[.*?\]$/gm;
export class ListTestFileListener extends AbstractProcessListener {
  protected get name(): string {
    return 'ListTestFileListener';
  }
  private buffer = '';
  private onResult: ListTestFilesCallback;

  constructor(session: ListenerSession, onResult: ListTestFilesCallback) {
    super(session);
    this.onResult = onResult;
  }

  protected onExecutableOutput(_process: JestProcess, data: string): void {
    this.buffer += data;
  }
  protected onProcessClose(process: JestProcess): void {
    super.onProcessClose(process);
    try {
      const json = this.buffer.match(JsonArrayRegexp);
      if (!json || json.length === 0) {
        // no test file is probably all right
        this.logging('debug', 'no test file is found');
        return this.onResult([]);
      }
      const uriFiles = json.reduce((totalFiles, list) => {
        const files: string[] = JSON.parse(list);
        // convert to uri style filePath to match vscode document names
        return totalFiles.concat(files.filter((f) => f).map((f) => vscode.Uri.file(f).fsPath));
      }, [] as string[]);

      this.logging('debug', `got ${uriFiles.length} test files`);
      return this.onResult(uriFiles);
    } catch (e) {
      this.logging('warn', 'failed to parse result:', this.buffer, 'error=', e);
      return this.onResult(undefined, e);
    }
  }
}

const SnapshotFailRegex = /(snapshots? failed)|(snapshot test failed)/i;
const IS_OUTSIDE_REPOSITORY_REGEXP =
  /Test suite failed to run[\s\S]*fatal:[\s\S]*is outside repository/im;
const WATCH_IS_NOT_SUPPORTED_REGEXP =
  /^s*--watch is not supported without git\/hg, please use --watchAlls*/im;

export class RunTestListener extends AbstractProcessListener {
  protected get name(): string {
    return 'RunTestListener';
  }
  //=== private methods ===
  private shouldIgnoreOutput(text: string): boolean {
    // this fails when snapshots change - to be revised - returning always false for now
    return (
      text.length <= 0 ||
      text.includes('Watch Usage') ||
      text.includes('onRunComplete') ||
      text.includes('onRunStart')
    );
  }

  // if snapshot error, offer update snapshot option and execute if user confirms
  private handleSnapshotTestFailuer(process: JestProcess, data: string) {
    // if already in the updateSnapshot run, do not prompt again
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    if ((process.request as any).updateSnapshot) {
      return;
    }

    if (
      this.session.context.settings.enableSnapshotUpdateMessages &&
      SnapshotFailRegex.test(data)
    ) {
      const scope =
        process.request.type === 'by-file'
          ? `for file "${process.request.testFileName}"`
          : `for all files in "${this.session.context.workspace.name}"`;
      vscode.window
        .showInformationMessage(`Would you like to update snapshots ${scope}?`, {
          title: 'Replace them',
        })
        .then((response) => {
          // No response == cancel
          if (response) {
            this.session.scheduleProcess({
              type: 'update-snapshot',
              baseRequest: process.request,
            });
            this.onRunEvent.fire({
              type: 'data',
              process,
              text: 'Updating snapshots...',
              newLine: true,
            });
          }
        });
    }
  }

  // restart the process with watch-all if it is due to "watch not supported" error
  private handleWatchNotSupportedError(process: JestProcess, data: string) {
    if (IS_OUTSIDE_REPOSITORY_REGEXP.test(data) || WATCH_IS_NOT_SUPPORTED_REGEXP.test(data)) {
      if (process.request.type !== 'watch-tests') {
        this.logging(
          'warn',
          `detected watch not supported message in a not-watch process "${process.request.type}", will ignore this error`
        );
        return;
      }
      this.logging('debug', '--watch is not supported, will start the --watchAll run instead');
      this.session.scheduleProcess({ type: 'watch-all-tests' });
      process.stop();
    }
  }

  // watch process should not exit unless we request it to be closed
  private handleWatchProcessCrash(process: JestProcess): string | undefined {
    if (
      (process.request.type === 'watch-tests' || process.request.type === 'watch-all-tests') &&
      process.stopReason !== 'on-demand'
    ) {
      const msg = prefixWorkspace(
        this.session.context,
        `Jest process "${process.request.type}" ended unexpectedly`
      );
      this.logging('warn', msg);

      return msg;
    }
  }

  //=== event handlers ===
  protected onExecutableJSON(process: JestProcess, data: JestTotalResults): void {
    this.session.context.updateWithData(data, process);
  }

  protected onExecutableStdErr(process: JestProcess, message: string, raw: string): void {
    if (this.shouldIgnoreOutput(message)) {
      return;
    }

    this.onRunEvent.fire({ type: 'data', process, text: message, raw });

    this.handleSnapshotTestFailuer(process, message);

    this.handleWatchNotSupportedError(process, message);
  }

  protected onExecutableOutput(process: JestProcess, output: string, raw: string): void {
    if (output.includes('onRunStart')) {
      if (isWatchRequest(process.request)) {
        this.onRunEvent.fire({ type: 'start', process });
      }
    }
    if (output.includes('onRunComplete')) {
      if (isWatchRequest(process.request)) {
        this.onRunEvent.fire({ type: 'end', process });
      }
    }

    if (!this.shouldIgnoreOutput(output)) {
      this.onRunEvent.fire({ type: 'data', process, text: output, raw });
    }
  }

  protected onTerminalError(process: JestProcess, data: string, raw: string): void {
    this.onRunEvent.fire({ type: 'data', process, text: data, raw, newLine: true, isError: true });
  }
  protected onProcessExit(_process: JestProcess): void {
    //override parent method so we will fire run event only when process closed
  }
  protected onProcessClose(process: JestProcess): void {
    super.onProcessClose(process);
    const error = this.handleWatchProcessCrash(process);
    this.onRunEvent.fire({ type: 'exit', process, error });
  }
}
