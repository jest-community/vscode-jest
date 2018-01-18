import { Runner, ProjectWorkspace } from 'jest-editor-support'

export class JestProcess {
  static readonly keepAliveLimit = 5
  private runner: Runner
  private projectWorkspace: ProjectWorkspace
  private onExitCallback: Function
  public keepAliveCounter: number
  public watchMode: boolean

  private startRunner() {
    let exited = false
    this.runner = new Runner(this.projectWorkspace)

    this.runner.start(this.watchMode)

    this.runner.on('debuggerProcessExit', () => {
      if (!exited) {
        exited = true
        this.onExitCallback(this)
        if (--this.keepAliveCounter > 0) {
          this.runner.removeAllListeners()
          this.startRunner()
        }
      }
    })
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
    this.keepAliveCounter = keepAlive ? JestProcess.keepAliveLimit : 1

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
    this.keepAliveCounter = 1
    this.runner.closeProcess()
  }

  public runJestWithUpdateForSnapshots(callback) {
    this.runner.runJestWithUpdateForSnapshots(callback)
  }
}
