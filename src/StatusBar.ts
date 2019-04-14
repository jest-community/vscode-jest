import * as vscode from 'vscode'
import * as elegantSpinner from 'elegant-spinner'
import { extensionName } from './appGlobals'
import { JestExt } from './JestExt'

enum StatusType {
  folder,
  workspace,
}

type Status = 'running' | 'failed' | 'success' | 'stopped' | 'initial'
type QueueItem = {
  source: string
  status: Status
  details: string | undefined
}

// The bottom status bar
export class StatusBar {
  private statusBarSpinner: NodeJS.Timer
  private folderStatus = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 2)
  private workspaceStatus = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 1)
  private statusKey = 'Jest:'
  private frame = elegantSpinner()
  private priorities: Status[] = ['running', 'failed', 'success', 'stopped', 'initial']
  private queue: QueueItem[] = []
  private _activeFolder?: string
  private workspaceOutput?: vscode.OutputChannel

  constructor() {
    this.workspaceStatus.tooltip = 'Jest status of the workspace'
    this.folderStatus.tooltip = 'Jest status of the current folder'
    this.workspaceStatus.show()
    this.folderStatus.show()
  }

  register(getExtension: (name: string) => JestExt | undefined) {
    const showWorkspaceOutput = `${extensionName}.show-ws-output`
    const showFolderOutput = `${extensionName}.show-folder-output`
    this.workspaceStatus.command = showWorkspaceOutput
    this.folderStatus.command = showFolderOutput

    return [
      vscode.commands.registerCommand(showWorkspaceOutput, () => {
        if (this.workspaceOutput) {
          this.workspaceOutput.show()
        }
      }),
      vscode.commands.registerCommand(showFolderOutput, () => {
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
        this.updateFolderStatus()
      }
    }
  }

  private enqueue(source: string, status: Status, details?: string) {
    this.queue = this.queue.filter(x => x.source !== source)
    this.queue.unshift({
      source,
      status,
      details,
    })
    this.updateStatus()
  }
  private updateStatus() {
    this.updateFolderStatus()
    this.updateWorkspaceStatus()
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

  private updateFolderStatus() {
    const queueItem = this.activeFolder
      ? this.queue.find(item => item.source === this.activeFolder)
      : this.queue.length === 1 ? this.queue[0] : undefined

    if (queueItem) {
      this.render(queueItem, StatusType.folder)
    }
  }

  private updateWorkspaceStatus() {
    if (this.isWorkspace()) {
      this.updateWorkspaceOutput()

      for (const status of this.priorities) {
        const queueItem = this.queue.find(item => item.status === status)
        if (queueItem) {
          this.render(queueItem, StatusType.workspace)
          break
        }
      }
    }
  }

  private render(queueItem: QueueItem, statusType: StatusType) {
    clearInterval(this.statusBarSpinner)

    const message = this.getMessageByStatus(queueItem.status)
    if (queueItem.status === 'running') {
      this.statusBarSpinner = setInterval(() => this.render(queueItem, statusType), 100)
    }
    // this.folderStatus.text = `${this.statusKey} ${message} ${queueItem.details || ''}||`
    switch (statusType) {
      case StatusType.folder:
        const details = !this.isWorkspace() && queueItem.details ? queueItem.details : ''
        this.folderStatus.text = `${this.statusKey} ${message} ${details}`
        this.folderStatus.tooltip = `Jest status of '${this.activeFolder}'`
        break
      case StatusType.workspace:
        this.workspaceStatus.text = `$(file-submodule) ${message}`
        break
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

  private isWorkspace() {
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
