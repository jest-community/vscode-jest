import * as vscode from 'vscode'
import * as elegantSpinner from 'elegant-spinner'
import { extensionName } from './appGlobals'
import { JestExt } from './JestExt'

enum StatusType {
  active,
  summary,
}

type Status = 'running' | 'failed' | 'success' | 'stopped' | 'initial'
interface QueueItem {
  source: string
  status: Status
  details: string | undefined
}

interface StatusBarSpinner {
  active?: NodeJS.Timer
  summary?: NodeJS.Timer
}

// The bottom status bar
export class StatusBar {
  private statusBarSpinner: StatusBarSpinner = {}
  private activeStatusItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 2)
  private summaryStatusItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 1)
  private frame = elegantSpinner()
  private priorities: Status[] = ['running', 'failed', 'success', 'stopped', 'initial']
  private queue: QueueItem[] = []
  private _activeFolder?: string
  private workspaceOutput?: vscode.OutputChannel

  constructor() {
    this.summaryStatusItem.tooltip = 'Jest status summary of the workspace'
    this.activeStatusItem.tooltip = 'Jest status of the active folder'
  }

  register(getExtension: (name: string) => JestExt | undefined) {
    const showSummaryOutput = `${extensionName}.show-summary-output`
    const showAciiveOutput = `${extensionName}.show-active-output`
    this.summaryStatusItem.command = showSummaryOutput
    this.activeStatusItem.command = showAciiveOutput

    return [
      vscode.commands.registerCommand(showSummaryOutput, () => {
        if (this.workspaceOutput) {
          this.workspaceOutput.show()
        }
      }),
      vscode.commands.registerCommand(showAciiveOutput, () => {
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
        this.enqueue(source, 'initial')
      },
      running: (details?: string) => {
        this.enqueue(source, 'running', details)
      },
      success: (details?: string) => {
        this.enqueue(source, 'success', details)
      },
      failed: (details?: string) => {
        this.enqueue(source, 'failed', details)
      },
      stopped: (details?: string) => {
        this.enqueue(source, 'stopped', details)
      },
    }
  }

  onDidChangeActiveTextEditor(editor: vscode.TextEditor) {
    if (editor && editor.document) {
      const folder = vscode.workspace.getWorkspaceFolder(editor.document.uri)
      if (folder && folder.name !== this.activeFolder) {
        this._activeFolder = folder.name
        this.updateActiveStatusItem()
      }
    }
  }

  private enqueue(source: string, status: Status, details?: string) {
    this.queue = this.queue.filter(x => x.source !== source)
    const item: QueueItem = {
      source,
      status,
      details,
    }
    this.queue.unshift(item)
    this.updateStatus(item)
  }
  private updateStatus(item: QueueItem) {
    this.updateActiveStatusItem(item)
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

  private updateActiveStatusItem(item?: QueueItem) {
    if (item && this.activeFolder) {
      if (item.source === this.activeFolder) {
        this.render(item, StatusType.active)
      }
      return
    }

    // find the active item from the queue
    const queueItem = this.activeFolder
      ? this.queue.find(_item => _item.source === this.activeFolder)
      : this.queue.length === 1
      ? this.queue[0]
      : undefined

    if (queueItem) {
      this.render(queueItem, StatusType.active)
    } else {
      this.hideStatusBarItem(StatusType.active)
    }
  }

  private updateSummaryStatus() {
    if (this.isMultiroot()) {
      this.updateWorkspaceOutput()

      for (const status of this.priorities) {
        const queueItem = this.queue.find(item => item.status === status)
        if (queueItem) {
          this.render(queueItem, StatusType.summary)
          return
        }
      }
    }
    this.hideStatusBarItem(StatusType.summary)
  }
  private hideStatusBarItem(statusType: StatusType) {
    clearInterval(this.getSpinner(statusType))
    switch (statusType) {
      case StatusType.active:
        this.activeStatusItem.hide()
        break
      case StatusType.summary:
        this.summaryStatusItem.hide()
        break
      default:
        throw new Error(`unexpected statusType: ${statusType}`)
    }
  }
  private render(queueItem: QueueItem, statusType: StatusType) {
    clearInterval(this.getSpinner(statusType))

    const message = this.getMessageByStatus(queueItem.status)
    if (queueItem.status === 'running') {
      this.setSpinner(statusType, () => this.render(queueItem, statusType))
    }

    switch (statusType) {
      case StatusType.active:
        const details = !this.isMultiroot() && queueItem.details ? queueItem.details : ''
        this.activeStatusItem.text = `Jest: ${message} ${details}`
        this.activeStatusItem.tooltip = `Jest status of '${this.activeFolder}'`
        this.activeStatusItem.show()
        break
      case StatusType.summary:
        this.summaryStatusItem.text = `Jest-WS: ${message}`
        this.summaryStatusItem.show()
        break
      default:
        throw new Error(`unexpected statusType: ${statusType}`)
    }
  }

  private getSpinner(type: StatusType) {
    switch (type) {
      case StatusType.active:
        return this.statusBarSpinner.active
      case StatusType.summary:
        return this.statusBarSpinner.summary
      default:
        throw new Error(`unexpected statusType: ${type}`)
    }
  }
  private setSpinner(type: StatusType, callback: () => void) {
    const timer = setInterval(callback, 100)
    switch (type) {
      case StatusType.active:
        this.statusBarSpinner.active = timer
        break
      case StatusType.summary:
        this.statusBarSpinner.summary = timer
        break
      default:
        throw new Error(`unexpected statusType: ${type}`)
    }
  }

  private updateWorkspaceOutput() {
    if (!this.workspaceOutput) {
      this.workspaceOutput = vscode.window.createOutputChannel('Jest (Workspace)')
    }
    this.workspaceOutput.clear()

    const messages = this.queue.map(item => {
      const details = item.details ? `: ${item.details}` : ''
      return `${item.source}: ${item.status} ${details}`
    })
    this.workspaceOutput.append(messages.join('\n'))
  }

  private isMultiroot() {
    return this.queue.length > 1
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
