import { ProjectWorkspace } from 'jest-editor-support'
import { JestProcess } from './JestProcess'

export class JestProcessManager {
  private projectWorkspace: ProjectWorkspace
  private jestProcesses: Array<JestProcess> = []

  constructor({ projectWorkspace }: { projectWorkspace: ProjectWorkspace }) {
    this.projectWorkspace = projectWorkspace
  }

  private onJestProcessExit(jestProcess, exitCallback) {
    const jestProcessInWatchMode = new JestProcess({
      projectWorkspace: this.projectWorkspace,
      watchMode: true,
    })
    this.jestProcesses.push(jestProcessInWatchMode)
    exitCallback(jestProcess, jestProcessInWatchMode)
    jestProcessInWatchMode.onExit(exitCallback)
  }

  private handleWatchMode(jestProcess, exitCallback) {
    jestProcess.onExit(exitedJestProcess => this.onJestProcessExit(exitedJestProcess, exitCallback))
  }

  private handleNonWatchMode(jestProcess, exitCallback) {
    jestProcess.onExit(exitCallback)
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

    this.jestProcesses.push(jestProcess)

    if (watch) {
      this.handleWatchMode(jestProcess, exitCallback)
    } else {
      this.handleNonWatchMode(jestProcess, exitCallback)
    }

    return jestProcess
  }
}
