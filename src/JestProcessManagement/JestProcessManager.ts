import { ProjectWorkspace } from 'jest-editor-support'
import { JestProcess } from './JestProcess'

export class JestProcessManager {
  private projectWorkspace: ProjectWorkspace
  private jestProcesses: Array<JestProcess> = []
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

  private startJestProcessInWatchMode(exitCallback, keepAlive) {
    return this.handleNonWatchMode(true, exitCallback, keepAlive)
  }

  private onJestProcessExit(jestProcess, exitCallback, keepAlive) {
    const jestProcessInWatchMode = this.startJestProcessInWatchMode(exitCallback, keepAlive)
    this.removeJestProcessReference(jestProcess)
    exitCallback(jestProcess, jestProcessInWatchMode)
  }

  private handleWatchMode(exitCallback, keepAlive) {
    const jestProcess = new JestProcess({
      projectWorkspace: this.projectWorkspace,
      watchMode: false,
      keepAlive: false,
    })

    this.jestProcesses.unshift(jestProcess)

    jestProcess.onExit(exitedJestProcess => this.onJestProcessExit(exitedJestProcess, exitCallback, keepAlive))

    return jestProcess
  }

  private removeJestProcessReference(jestProcess) {
    const index = this.jestProcesses.indexOf(jestProcess)
    if (index !== -1) {
      this.jestProcesses.splice(index, 1)
    }
  }

  private handleNonWatchMode(watchMode, exitCallback, keepAlive) {
    const jestProcess = new JestProcess({
      projectWorkspace: this.projectWorkspace,
      watchMode: watchMode,
      keepAlive: keepAlive,
    })

    this.jestProcesses.unshift(jestProcess)

    jestProcess.onExit(exitedJestProcess => {
      exitCallback(exitedJestProcess)
      if (!exitedJestProcess.keepAlive) {
        this.removeJestProcessReference(exitedJestProcess)
      }
    })
    return jestProcess
  }

  public startJestProcess(
    {
      exitCallback = () => {},
      watch = false,
      keepAlive = false,
    }: {
      exitCallback?: Function
      watch?: boolean
      keepAlive?: boolean
    } = {
      exitCallback: () => {},
      watch: false,
      keepAlive: false,
    }
  ): JestProcess {
    if (watch && this.runAllTestsFirstInWatchMode) {
      return this.handleWatchMode(exitCallback, keepAlive)
    } else {
      return this.handleNonWatchMode(watch, exitCallback, keepAlive)
    }
  }

  public stopAll() {
    const processesToRemove = [...this.jestProcesses]
    this.jestProcesses = []
    processesToRemove.forEach(jestProcess => {
      jestProcess.stop()
    })
  }

  public stopJestProcess(jestProcess) {
    this.removeJestProcessReference(jestProcess)
    jestProcess.stop()
  }

  public get numberOfProcesses() {
    return this.jestProcesses.length
  }
}
