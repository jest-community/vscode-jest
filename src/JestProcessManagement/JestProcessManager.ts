import { ProjectWorkspace } from 'jest-editor-support'
import { JestProcess } from './JestProcess'
import { WatchMode } from '../Jest'

export type ExitCallback = (exitedJestProcess: JestProcess, jestProcessInWatchMode?: JestProcess) => void

interface ProcessInfo {
  process: JestProcess
  cancel: () => Promise<void>
}
export class JestProcessManager {
  private projectWorkspace: ProjectWorkspace
  private jestProcesses: ProcessInfo[] = []
  private runAllTestsFirstInWatchMode: boolean

  constructor({
    projectWorkspace,
    runAllTestsFirstInWatchMode = true,
  }: {
    projectWorkspace: ProjectWorkspace
    runAllTestsFirstInWatchMode?: boolean
  }) {
    this.projectWorkspace = projectWorkspace
    this.runAllTestsFirstInWatchMode = runAllTestsFirstInWatchMode
  }

  public startJestProcess({
    exitCallback = () => {},
    watchMode = WatchMode.None,
    keepAlive = false,
  }: {
    exitCallback?: ExitCallback
    watchMode?: WatchMode
    keepAlive?: boolean
  } = {}): JestProcess {
    const keepAliveCallback: ExitCallback = (exitedJestProcess: JestProcess) => {
      exitCallback(exitedJestProcess)
      if (!exitedJestProcess.keepAlive) {
        this.removeJestProcessReference(exitedJestProcess)
      }
    }
    if (watchMode !== WatchMode.None && this.runAllTestsFirstInWatchMode) {
      let isCancelled = false
      return this.runJest({
        watchMode: WatchMode.None,
        keepAlive: false,
        onCancel: () => {
          isCancelled = true
        },
        exitCallback: exitedJestProcess => {
          this.removeJestProcessReference(exitedJestProcess)
          if (!isCancelled) {
            const jestProcessInWatchMode = this.runJest({
              watchMode: WatchMode.Watch,
              keepAlive,
              exitCallback: keepAliveCallback,
            })
            exitCallback(exitedJestProcess, jestProcessInWatchMode)
          }
        },
      })
    } else {
      return this.runJest({
        watchMode,
        keepAlive,
        exitCallback: keepAliveCallback,
      })
    }
  }

  public stopAll() {
    const processesToRemove = [...this.jestProcesses]
    this.jestProcesses = []
    return Promise.all(processesToRemove.map(p => p.cancel()))
  }

  public stopJestProcess(jestProcess: JestProcess) {
    const pInfo = this.removeJestProcessReference(jestProcess)
    if (pInfo) {
      return pInfo.cancel()
    }
    // is this a valid situation?
    return jestProcess.stop()
  }

  public get numberOfProcesses() {
    return this.jestProcesses.length
  }

  private removeJestProcessReference(jestProcess: JestProcess): ProcessInfo | undefined {
    const index = this.jestProcesses.findIndex(jp => jp.process === jestProcess)
    if (index !== -1) {
      return this.jestProcesses.splice(index, 1)[0]
    }
  }

  private runJest({
    watchMode,
    keepAlive,
    exitCallback,
    onCancel,
  }: {
    watchMode: WatchMode
    keepAlive: boolean
    exitCallback: ExitCallback
    onCancel?: () => void
  }) {
    const jestProcess = new JestProcess({
      projectWorkspace: this.projectWorkspace,
      watchMode,
      keepAlive,
    })

    const pInfo = {
      process: jestProcess,
      cancel: () => {
        if (onCancel) {
          onCancel()
        }
        return jestProcess.stop()
      },
    }
    this.jestProcesses.unshift(pInfo)

    jestProcess.onExit(exitCallback)
    return jestProcess
  }
}
