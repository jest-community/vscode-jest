import { Runner, ProjectWorkspace } from 'jest-editor-support'

export class JestProcess {
  private runner: Runner
  private onExitCallback: Function
  private exited: boolean = false

  constructor({ projectWorkspace, watchMode = false }: { projectWorkspace: ProjectWorkspace; watchMode?: boolean }) {
    this.runner = new Runner(projectWorkspace)

    this.runner.start(watchMode)

    this.runner.on('debuggerProcessExit', () => {
      if (!this.exited) {
        this.exited = true
        this.onExitCallback()
      }
    })
  }

  public onExit(callback) {
    this.onExitCallback = callback
  }

  public onJestEditorSupportEvent(event, callback) {
    this.runner.on(event, callback)
  }
}
