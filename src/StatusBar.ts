import { window, StatusBarAlignment } from 'vscode'
import * as elegantSpinner from 'elegant-spinner'

type Status = 'running' | 'failed' | 'success' | 'stopped' | 'initial'
type QueueItem = {
  source: string
  status: Status
  details: string | undefined
}

// The bottom status bar
export class StatusBar {
  private statusBarSpinner: NodeJS.Timer
  private statusBarItem = window.createStatusBarItem(StatusBarAlignment.Left)
  private statusKey = 'Jest:'
  private frame = elegantSpinner()
  private priorities: Status[] = ['running', 'failed', 'success', 'stopped', 'initial']
  private queue: QueueItem[] = []
  constructor() {
    this.statusBarItem.show()
  }
  registerCommand(statusBarCommand: string) {
    this.statusBarItem.command = statusBarCommand
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
    for (const status of this.priorities) {
      const queueItem = this.queue.find(item => item.status === status)
      if (queueItem) {
        this.render(queueItem)
        break
      }
    }
  }
  private render(queueItem: QueueItem) {
    clearInterval(this.statusBarSpinner)
    const message = this.getMessageByStatus(queueItem.status)
    if (queueItem.status === 'running') {
      this.statusBarSpinner = setInterval(() => this.render(queueItem), 100)
    }
    this.statusBarItem.text = `${this.statusKey} ${message} ${queueItem.details || ''}`
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
