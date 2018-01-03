import { ProjectWorkspace } from 'jest-editor-support'
import { JestProcess } from './JestProcess'

export class JestProcessManager {
  private projectWorkspace: ProjectWorkspace
  private jestProcesses: Array<JestProcess> = []

  constructor({ projectWorkspace }: { projectWorkspace: ProjectWorkspace }) {
    this.projectWorkspace = projectWorkspace
  }

  private startJestProcessInWatchMode(exitCallback) {
    const jestProcessInWatchMode = new JestProcess({
      projectWorkspace: this.projectWorkspace,
      watchMode: true,
    })
    this.jestProcesses.unshift(jestProcessInWatchMode)
    this.handleNonWatchMode(jestProcessInWatchMode, exitCallback)
    return jestProcessInWatchMode
  }

  private onJestProcessExit(jestProcess, exitCallback) {
    const jestProcessInWatchMode = this.startJestProcessInWatchMode(exitCallback)
    this.removeJestProcessReference(jestProcess)
    exitCallback(jestProcess, jestProcessInWatchMode)
  }

  private handleWatchMode(jestProcess, exitCallback) {
    jestProcess.onExit(exitedJestProcess => this.onJestProcessExit(exitedJestProcess, exitCallback))
  }

  private removeJestProcessReference(jestProcess) {
    const index = this.jestProcesses.indexOf(jestProcess)
    if (index !== -1) {
      this.jestProcesses.splice(index, 1)
    }
  }

  private handleNonWatchMode(jestProcess, exitCallback) {
    jestProcess.onExit(exitedJestProcess => {
      exitCallback(exitedJestProcess)
      this.removeJestProcessReference(exitedJestProcess)
    })
  }

  public startJestProcess(
    {
      exitCallback = () => {},
      watch = false,
    }: {
      exitCallback?: () => void
      watch?: boolean
    } = {
      exitCallback: () => {},
      watch: false,
    }
  ): JestProcess {
    const jestProcess = new JestProcess({
      projectWorkspace: this.projectWorkspace,
      watchMode: false,
    })

    this.jestProcesses.unshift(jestProcess)

    if (watch) {
      this.handleWatchMode(jestProcess, exitCallback)
    } else {
      this.handleNonWatchMode(jestProcess, exitCallback)
    }

    return jestProcess
  }

  public stopJestProcess() {
    if (this.jestProcesses.length > 0) {
      const mostRecentJestProcess = this.jestProcesses[0]
      mostRecentJestProcess.stop()
      this.jestProcesses.shift()
    }
  }

  public get numberOfProcesses() {
    return this.jestProcesses.length
  }
}
