import { Runner, ProjectWorkspace } from 'jest-editor-support'

export class JestProcess {
  private runner: Runner
  private exited: boolean
  private projectWorkspace: ProjectWorkspace
  public keepAlive: boolean
  public onExitCallback: Function
  public watchMode: boolean

  private startRunner() {
    this.exited = false
    this.runner = new Runner(this.projectWorkspace)

    this.runner.start(this.watchMode)

    this.runner.on('debuggerProcessExit', () => {
      if (!this.exited) {
        this.exited = true
        this.onExitCallback(this)
        if (this.keepAlive) {
          this.restart()
        }
      }
    })
  }

  private restart() {
    this.runner.removeAllListeners()
    this.startRunner()
  }

  constructor({
    projectWorkspace,
    watchMode = false,
    keepAlive = false,
  }: {
    projectWorkspace: ProjectWorkspace
    watchMode?: boolean
    keepAlive?: boolean
  }) {
    this.watchMode = watchMode
    this.projectWorkspace = projectWorkspace
    this.keepAlive = keepAlive

    this.startRunner()
  }

  public onExit(callback: Function) {
    this.onExitCallback = callback
  }

  public onJestEditorSupportEvent(event, callback) {
    this.runner.on(event, callback)
    return this
  }

  public stop() {
    this.keepAlive = false
    this.runner.closeProcess()
  }

  public runJestWithUpdateForSnapshots(callback) {
    this.runner.runJestWithUpdateForSnapshots(callback)
  }
}
