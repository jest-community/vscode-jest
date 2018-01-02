import { ProjectWorkspace } from 'jest-editor-support'
import { JestProcess } from './JestProcess'

export class JestProcessManager {
  private projectWorkspace: ProjectWorkspace
  private jestProcess: JestProcess
  private jestProcessInWatchMode: JestProcess

  constructor({ projectWorkspace }: { projectWorkspace: ProjectWorkspace }) {
    this.projectWorkspace = projectWorkspace
  }

  private onJestProcessExit(jestProcess, exitCallback) {
    exitCallback(jestProcess)
    this.jestProcessInWatchMode = new JestProcess({
      projectWorkspace: this.projectWorkspace,
      watchMode: true,
    })
    this.jestProcessInWatchMode.onExit(exitCallback)
  }

  private handleWatchMode(exitCallback) {
    this.jestProcess.onExit(jestProcess => this.onJestProcessExit(jestProcess, exitCallback))
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
    this.jestProcess = new JestProcess({
      projectWorkspace: this.projectWorkspace,
      watchMode: false,
    })

    if (watch) {
      this.handleWatchMode(exitCallback)
    } else {
      this.jestProcess.onExit(exitCallback)
    }

    return this.jestProcess
  }
}
