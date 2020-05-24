import { ProjectWorkspace } from 'jest-editor-support';
import { JestProcess } from './JestProcess';
import { WatchMode } from '../Jest';

export type ExitCallback = (
  exitedJestProcess: JestProcess,
  jestProcessInWatchMode?: JestProcess
) => void;

export class JestProcessManager {
  private projectWorkspace: ProjectWorkspace;
  private jestProcesses: JestProcess[] = [];
  private runAllTestsFirstInWatchMode: boolean;

  constructor({
    projectWorkspace,
    runAllTestsFirstInWatchMode = true,
  }: {
    projectWorkspace: ProjectWorkspace;
    runAllTestsFirstInWatchMode?: boolean;
  }) {
    this.projectWorkspace = projectWorkspace;
    this.runAllTestsFirstInWatchMode = runAllTestsFirstInWatchMode;
  }

  public startJestProcess({
    exitCallback = () => {
      /* do nothing */
    },
    watchMode = WatchMode.None,
    keepAlive = false,
  }: {
    exitCallback?: ExitCallback;
    watchMode?: WatchMode;
    keepAlive?: boolean;
  } = {}): JestProcess {
    if (watchMode !== WatchMode.None && this.runAllTestsFirstInWatchMode) {
      return this.runAllTestsFirst((exitedJestProcess) => {
        // cancel the rest execution if stop() has been requested.
        if (exitedJestProcess.stopRequested()) {
          return;
        }
        this.removeJestProcessReference(exitedJestProcess);
        const jestProcessInWatchMode = this.run({
          watchMode: WatchMode.Watch,
          keepAlive,
          exitCallback,
        });
        exitCallback(exitedJestProcess, jestProcessInWatchMode);
      });
    } else {
      return this.run({
        watchMode,
        keepAlive,
        exitCallback,
      });
    }
  }

  public stopAll() {
    const processesToRemove = [...this.jestProcesses];
    this.jestProcesses = [];
    return Promise.all(processesToRemove.map((jestProcess) => jestProcess.stop()));
  }

  public stopJestProcess(jestProcess: JestProcess) {
    this.removeJestProcessReference(jestProcess);
    return jestProcess.stop();
  }

  public get numberOfProcesses() {
    return this.jestProcesses.length;
  }
  private removeJestProcessReference(jestProcess: JestProcess) {
    const index = this.jestProcesses.indexOf(jestProcess);
    if (index !== -1) {
      this.jestProcesses.splice(index, 1);
    }
  }

  private runJest({
    watchMode,
    keepAlive,
    exitCallback,
  }: {
    watchMode: WatchMode;
    keepAlive: boolean;
    exitCallback: ExitCallback;
  }) {
    const jestProcess = new JestProcess({
      projectWorkspace: this.projectWorkspace,
      watchMode,
      keepAlive,
    });

    this.jestProcesses.unshift(jestProcess);

    jestProcess.onExit(exitCallback);
    return jestProcess;
  }

  private run({
    watchMode,
    keepAlive,
    exitCallback,
  }: {
    watchMode: WatchMode;
    keepAlive: boolean;
    exitCallback: ExitCallback;
  }) {
    return this.runJest({
      watchMode,
      keepAlive,
      exitCallback: (exitedJestProcess: JestProcess) => {
        exitCallback(exitedJestProcess);
        if (!exitedJestProcess.keepAlive) {
          this.removeJestProcessReference(exitedJestProcess);
        }
      },
    });
  }

  private runAllTestsFirst(onExit: ExitCallback) {
    return this.runJest({
      watchMode: WatchMode.None,
      keepAlive: false,
      exitCallback: onExit,
    });
  }
}
