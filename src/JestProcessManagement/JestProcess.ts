import * as vscode from 'vscode';
import { join } from 'path';
import { Runner, ProjectWorkspace } from 'jest-editor-support';
import { WatchMode } from '../Jest';
import { ExitCallback } from './JestProcessManager';
import { extensionId } from '../appGlobals';

export class JestProcess {
  static readonly keepAliveLimit = 5;
  static readonly stopHangTimeout = 500;
  public keepAlive: boolean;
  public watchMode: WatchMode;
  private runner: Runner;
  private projectWorkspace: ProjectWorkspace;
  private onExitCallback: ExitCallback;
  private jestSupportEvents: Map<string, (...args: any[]) => void>;
  private stopResolveCallback: () => void | null;
  private keepAliveCounter: number;

  constructor({
    projectWorkspace,
    watchMode = WatchMode.None,
    keepAlive = false,
  }: {
    projectWorkspace: ProjectWorkspace;
    watchMode?: WatchMode;
    keepAlive?: boolean;
  }) {
    this.keepAlive = keepAlive;
    this.watchMode = watchMode;
    this.projectWorkspace = projectWorkspace;
    this.keepAliveCounter = keepAlive ? JestProcess.keepAliveLimit : 1;
    this.jestSupportEvents = new Map();

    this.startRunner();
  }

  public onExit(callback: ExitCallback) {
    this.onExitCallback = callback;
  }

  public onJestEditorSupportEvent(event: string, callback: (...args: any[]) => void) {
    this.jestSupportEvents.set(event, callback);
    this.runner.on(event, callback);
    return this;
  }

  public stop(): Promise<void> {
    return new Promise((resolve) => {
      this.keepAliveCounter = 1;
      this.stopResolveCallback = resolve;
      this.jestSupportEvents.clear();
      this.runner.closeProcess();

      // As a safety fallback to prevent the stop from hanging, resolve after a timeout
      // this is safe since subsequent resolve calls are no-op
      // TODO: If `closeProcess` can be guarenteed to always resolve, remove this
      setTimeout(resolve, JestProcess.stopHangTimeout);
    });
  }

  public runJestWithUpdateForSnapshots(callback: () => void) {
    this.runner.runJestWithUpdateForSnapshots(callback);
  }

  public stopRequested(): boolean {
    return this.stopResolveCallback !== null;
  }
  private startRunner() {
    this.stopResolveCallback = null;
    let exited = false;

    const extensionPath = vscode.extensions.getExtension(extensionId).extensionPath;
    const reporterPath = join(extensionPath, 'out', 'reporter.js');

    const options = {
      noColor: true,
      reporters: ['default', `"${reporterPath}"`],
    };
    this.runner = new Runner(this.projectWorkspace, options);

    this.restoreJestEvents();

    this.runner.start(this.watchMode !== WatchMode.None, this.watchMode === WatchMode.WatchAll);

    this.runner.on('debuggerProcessExit', () => {
      if (!exited) {
        exited = true;
        if (--this.keepAliveCounter > 0) {
          this.runner.removeAllListeners();
          this.startRunner();
        } else {
          if (this.onExitCallback) {
            this.onExitCallback(this);
          }
          if (this.stopResolveCallback) {
            this.stopResolveCallback();
            this.stopResolveCallback = null;
          }
        }
      }
    });
  }

  private restoreJestEvents() {
    for (const [event, callback] of this.jestSupportEvents.entries()) {
      this.runner.on(event, callback);
    }
  }
}
