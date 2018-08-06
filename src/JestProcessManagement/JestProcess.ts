import { platform } from 'os'
import { Runner, ProjectWorkspace } from 'jest-editor-support'
import { WatchMode } from '../Jest'

export class JestProcess {
  static readonly keepAliveLimit = 5
  private runner: Runner
  private projectWorkspace: ProjectWorkspace
  private onExitCallback: Function
  private jestSupportEvents: Map<string, (...args: any[]) => void>
  private resolve: Function
  private keepAliveCounter: number
  public keepAlive: boolean
  public stopRequested: boolean
  watchMode: WatchMode

  private startRunner() {
    this.stopRequested = false
    let exited = false

    const options = {
      noColor: true,
      shell: platform() === 'win32',
    }
    this.runner = new Runner(this.projectWorkspace, options)

    this.restoreJestEvents()

    this.runner.start(this.watchMode !== WatchMode.None, this.watchMode === WatchMode.WatchAll)

    this.runner.on('debuggerProcessExit', () => {
      if (!exited) {
        exited = true
        if (--this.keepAliveCounter > 0) {
          this.runner.removeAllListeners()
          this.startRunner()
        } else if (this.onExitCallback) {
          this.onExitCallback(this)
          if (this.stopRequested) {
            this.resolve()
          }
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
    watchMode = WatchMode.None,
    keepAlive = false,
  }: {
    projectWorkspace: ProjectWorkspace
    watchMode?: WatchMode
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
    return new Promise(resolve => {
      this.resolve = resolve
    })
  }

  public runJestWithUpdateForSnapshots(callback) {
    this.runner.runJestWithUpdateForSnapshots(callback)
  }
}
