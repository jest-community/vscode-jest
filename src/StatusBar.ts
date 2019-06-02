import * as vscode from 'vscode'
import * as elegantSpinner from 'elegant-spinner'
import { extensionName } from './appGlobals'
import { JestExt } from './JestExt'

export enum StatusType {
  active,
  summary,
}

type Status = 'running' | 'failed' | 'success' | 'stopped' | 'initial'
interface StatusUpdateRequest {
  source: string
  status: Status
  details: string | undefined
}

interface SpinnableStatusBarItem {
  readonly type: StatusType
  command: string | undefined
  text: string | undefined
  tooltip: string | undefined

  show(): void
  hide(): void
  clearSpinner(): void
  startSpinner(callback: () => void): void
}

const createStatusBarItem = (type: StatusType, priority: number): SpinnableStatusBarItem => {
  let spinner: NodeJS.Timer | undefined
  const item = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, priority)
  const clearSpinner = () => {
    if (spinner) {
      clearInterval(spinner)
    }
  }

  return {
    type,
    clearSpinner,
    startSpinner: (callback: () => void, interval = 100) => {
      clearSpinner()
      spinner = setInterval(callback, interval)
    },
    show: () => item.show(),
    hide: () => {
      item.hide()
      clearSpinner()
    },

    get command() {
      return item.command
    },
    get text() {
      return item.text
    },
    get tooltip() {
      return item.tooltip
    },

    set command(_command: string) {
      item.command = _command
    },
    set text(_text: string) {
      item.text = _text
    },
    set tooltip(_tooltip: string) {
      item.tooltip = _tooltip
    },
  }
}

// The bottom status bar
export class StatusBar {
  private activeStatusItem = createStatusBarItem(StatusType.active, 2)
  private summaryStatusItem = createStatusBarItem(StatusType.summary, 1)

  private frame = elegantSpinner()
  private priorities: Status[] = ['running', 'failed', 'success', 'stopped', 'initial']
  private requests = new Map<string, StatusUpdateRequest>()
  private _activeFolder?: string
  private summaryOutput?: vscode.OutputChannel

  constructor() {
    this.summaryStatusItem.tooltip = 'Jest status summary of the workspace'
    this.activeStatusItem.tooltip = 'Jest status of the active folder'
  }

  register(getExtension: (name: string) => JestExt | undefined) {
    const showSummaryOutput = `${extensionName}.show-summary-output`
    const showActiveOutput = `${extensionName}.show-active-output`
    this.summaryStatusItem.command = showSummaryOutput
    this.activeStatusItem.command = showActiveOutput

    return [
      vscode.commands.registerCommand(showSummaryOutput, () => {
        if (this.summaryOutput) {
          this.summaryOutput.show()
        }
      }),
      vscode.commands.registerCommand(showActiveOutput, () => {
        if (this.activeFolder) {
          const ext = getExtension(this.activeFolder)
          if (ext) {
            ext.channel.show()
          }
        }
      }),
    ]
  }
  bind(source: string) {
    return {
      initial: () => {
        this.request(source, 'initial')
      },
      running: (details?: string) => {
        this.request(source, 'running', details)
      },
      success: (details?: string) => {
        this.request(source, 'success', details)
      },
      failed: (details?: string) => {
        this.request(source, 'failed', details)
      },
      stopped: (details?: string) => {
        this.request(source, 'stopped', details)
      },
    }
  }

  onDidChangeActiveTextEditor(editor: vscode.TextEditor) {
    if (editor && editor.document) {
      const folder = vscode.workspace.getWorkspaceFolder(editor.document.uri)
      if (folder && folder.name !== this._activeFolder) {
        this._activeFolder = folder.name
        this.updateActiveStatus()
      }
    }
  }

  private request(source: string, status: Status, details?: string) {
    const request: StatusUpdateRequest = {
      source,
      status,
      details,
    }
    this.requests.set(source, request)
    this.updateStatus(request)
  }
  private updateStatus(request: StatusUpdateRequest) {
    this.updateActiveStatus(request)
    this.updateSummaryStatus()
  }

  private get activeFolder() {
    if (!this._activeFolder && vscode.window.activeTextEditor) {
      const folder = vscode.workspace.getWorkspaceFolder(vscode.window.activeTextEditor.document.uri)
      if (folder) {
        this._activeFolder = folder.name
      }
    }
    return this._activeFolder
  }

  private updateActiveStatus(request?: StatusUpdateRequest) {
    if (request && this.activeFolder) {
      if (request.source === this.activeFolder) {
        this.render(request, this.activeStatusItem)
      }
      return
    }

    // find the active item from requests
    let _request = null
    if (this.activeFolder) {
      _request = this.requests.get(this.activeFolder)
    }
    if (!_request && this.requests.size === 1) {
      _request = this.requests.values().next().value
    }

    if (_request) {
      this.render(_request, this.activeStatusItem)
    } else {
      this.activeStatusItem.hide()
    }
  }

  private updateSummaryStatus() {
    if (this.needsSummaryStatus()) {
      this.updateSummaryOutput()

      let summaryStatus: StatusUpdateRequest | undefined
      let prev = 99
      for (const r of this.requests.values()) {
        const idx = this.priorities.indexOf(r.status)
        if (idx >= 0 && idx < prev) {
          summaryStatus = r
          prev = idx
        }
      }

      if (summaryStatus) {
        this.render(summaryStatus, this.summaryStatusItem)
        return
      }
    }
    this.summaryStatusItem.hide()
  }

  private render(request: StatusUpdateRequest, statusBarItem: SpinnableStatusBarItem) {
    statusBarItem.clearSpinner()

    const message = this.getMessageByStatus(request.status)
    if (request.status === 'running') {
      statusBarItem.startSpinner(() => this.render(request, statusBarItem))
    }

    switch (statusBarItem.type) {
      case StatusType.active:
        const details = !this.needsSummaryStatus() && request.details ? request.details : ''
        statusBarItem.text = `Jest: ${message} ${details}`
        statusBarItem.tooltip = `Jest status of '${this.activeFolder}'`
        break
      case StatusType.summary:
        statusBarItem.text = `Jest-WS: ${message}`
        break
      default:
        throw new Error(`unexpected statusType: ${statusBarItem.type}`)
    }
    statusBarItem.show()
  }

  private updateSummaryOutput() {
    if (!this.summaryOutput) {
      this.summaryOutput = vscode.window.createOutputChannel('Jest (Workspace)')
    }
    this.summaryOutput.clear()

    const messages = []
    this.requests.forEach(item => {
      const details = item.details ? `: ${item.details}` : ''
      messages.push(`${item.source}: ${item.status} ${details}`)
    })
    this.summaryOutput.append(messages.join('\n'))
  }

  private needsSummaryStatus() {
    return this.requests.size > 1
  }

  private getMessageByStatus(status: Status) {
    switch (status) {
      case 'running':
        return this.frame()
      case 'failed':
        return '$(alert)'
      case 'success':
        return '$(check)'
      case 'initial':
        return '...'
      default:
        return status
    }
  }
}

export const statusBar = new StatusBar()
