import { ProjectWorkspace } from 'jest-editor-support'
import { JestProcess } from './JestProcess'

export class JestProcessManager {
  private projectWorkspace: ProjectWorkspace
  private jestProcesses: Array<JestProcess> = []
  private runAllTestsFirstInWatchMode: boolean

  constructor({
    projectWorkspace,
    runAllTestsFirstInWatchMode = true,
  }: {
    projectWorkspace: ProjectWorkspace
    runAllTestsFirstInWatchMode?: boolean
  }) {
    this.projectWorkspace = projectWorkspace
    this.runAllTestsFirstInWatchMode = runAllTestsFirstInWatchMode
  }

  private removeJestProcessReference(jestProcess) {
    const index = this.jestProcesses.indexOf(jestProcess)
    if (index !== -1) {
      this.jestProcesses.splice(index, 1)
    }
  }

  private runJest({ watch, keepAlive, exitCallback }) {
    const jestProcess = new JestProcess({
      projectWorkspace: this.projectWorkspace,
      watchMode: watch,
      keepAlive: keepAlive,
    })

    this.jestProcesses.unshift(jestProcess)

    jestProcess.onExit(exitCallback)
    return jestProcess
  }

  private run({ watch, keepAlive, exitCallback }) {
    return this.runJest({
      watch,
      keepAlive,
      exitCallback: exitedJestProcess => {
        exitCallback(exitedJestProcess)
        if (!exitedJestProcess.keepAlive) {
          this.removeJestProcessReference(exitedJestProcess)
        }
      },
    })
  }

  private runAllTestsFirst(onExit) {
    return this.runJest({
      watch: false,
      keepAlive: false,
      exitCallback: onExit,
    })
  }

  public startJestProcess(
    {
      exitCallback = () => {},
      watch = false,
      keepAlive = false,
    }: {
      exitCallback?: Function
      watch?: boolean
      keepAlive?: boolean
    } = {
      exitCallback: () => {},
      watch: false,
      keepAlive: false,
    }
  ): JestProcess {
    if (watch && this.runAllTestsFirstInWatchMode) {
      return this.runAllTestsFirst(exitedJestProcess => {
        this.removeJestProcessReference(exitedJestProcess)
        const jestProcessInWatchMode = this.run({
          watch: true,
          keepAlive: keepAlive,
          exitCallback: exitCallback,
        })
        exitCallback(exitedJestProcess, jestProcessInWatchMode)
      })
    } else {
      return this.run({
        watch: watch,
        keepAlive: keepAlive,
        exitCallback: exitCallback,
      })
    }
  }

  public stopAll() {
    const processesToRemove = [...this.jestProcesses]
    this.jestProcesses = []
    processesToRemove.forEach(jestProcess => {
      jestProcess.stop()
    })
  }

  public stopJestProcess(jestProcess) {
    this.removeJestProcessReference(jestProcess)
    jestProcess.stop()
  }

  public get numberOfProcesses() {
    return this.jestProcesses.length
  }
}
