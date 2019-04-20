import { platform } from 'os'
import { Runner, ProjectWorkspace } from 'jest-editor-support'
import { WatchMode } from '../Jest'

export type ExitCallback = (process: JestProcess) => void

export class JestProcess {
  static readonly keepAliveLimit = 5
  public keepAlive: boolean
  public stopRequested: boolean
  public watchMode: WatchMode
  private runner: Runner
  private projectWorkspace: ProjectWorkspace
  private onExitCallback: ExitCallback
  private jestSupportEvents: Map<string, (...args: any[]) => void>
  private resolve: () => void
  private keepAliveCounter: number

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

  public onExit(callback: ExitCallback) {
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
}
