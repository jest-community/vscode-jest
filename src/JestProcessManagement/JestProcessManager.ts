import { ProjectWorkspace } from 'jest-editor-support'
import { JestProcess } from './JestProcess'

export class JestProcessManager {
  private projectWorkspace: ProjectWorkspace
  private jestProcess: JestProcess

  constructor({ projectWorkspace }: { projectWorkspace: ProjectWorkspace }) {
    this.projectWorkspace = projectWorkspace
  }

  public startJestProcess(exitCallback?: () => void): JestProcess {
    this.jestProcess = new JestProcess({
      projectWorkspace: this.projectWorkspace,
      watchMode: false,
    })

    if (exitCallback) {
      this.jestProcess.onExit(exitCallback)
    }
    return this.jestProcess
  }
}
