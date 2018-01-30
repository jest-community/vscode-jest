import { Runner, ProjectWorkspace } from 'jest-editor-support'

export class JestProcess {
  static readonly keepAliveLimit = 5
  private runner: Runner
  private projectWorkspace: ProjectWorkspace
  private onExitCallback: Function
  private jestSupportEvents: Map<string, (...args: any[]) => void>
  private keepAliveCounter: number
  public keepAlive: boolean
  public watchMode: boolean
  public stopRequested: boolean

  private startRunner() {
    this.stopRequested = false
    let exited = false
    this.runner = new Runner(this.projectWorkspace)

    this.runner.start(this.watchMode)

    this.restoreJestEvents()

    this.runner.on('debuggerProcessExit', () => {
      if (!exited) {
        exited = true
        if (--this.keepAliveCounter > 0) {
          this.runner.removeAllListeners()
          this.startRunner()
        } else if (this.onExitCallback) {
          this.onExitCallback(this)
        }
      }
    })
  }

  private restoreJestEvents() {
    for (const [event, callback] of this.jestSupportEvents.entries()) {
      this.runner.on(event, callback)
    }
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
    this.keepAlive = keepAlive
    this.watchMode = watchMode
    this.projectWorkspace = projectWorkspace
    this.keepAliveCounter = keepAlive ? JestProcess.keepAliveLimit : 1
    this.jestSupportEvents = new Map()

    this.startRunner()
  }

  public onExit(callback: Function) {
    this.onExitCallback = callback
  }

  public onJestEditorSupportEvent(event, callback) {
    this.jestSupportEvents.set(event, callback)
    this.runner.on(event, callback)
    return this
  }

  public stop() {
    this.stopRequested = true
    this.keepAliveCounter = 1
    this.jestSupportEvents.clear()
    this.runner.closeProcess()
  }

  public runJestWithUpdateForSnapshots(callback) {
    this.runner.runJestWithUpdateForSnapshots(callback)
  }
}
