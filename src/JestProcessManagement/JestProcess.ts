import { Runner, ProjectWorkspace } from 'jest-editor-support'

export class JestProcess {
  private runner: Runner
  private onExitCallback: Function
  private exited: boolean = false
  public watchMode: boolean

  constructor({ projectWorkspace, watchMode = false }: { projectWorkspace: ProjectWorkspace; watchMode?: boolean }) {
    this.watchMode = watchMode
    this.runner = new Runner(projectWorkspace)

    this.runner.start(watchMode)

    this.runner.on('debuggerProcessExit', () => {
      if (!this.exited) {
        this.exited = true
        this.onExitCallback(this)
      }
    })
  }

  public onExit(callback) {
    this.onExitCallback = callback
  }

  public onJestEditorSupportEvent(event, callback) {
    this.runner.on(event, callback)
  }

  public stop() {
    this.runner.closeProcess()
  }
}
