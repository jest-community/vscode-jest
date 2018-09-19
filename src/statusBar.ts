import { window, StatusBarAlignment } from 'vscode'
import * as elegantSpinner from 'elegant-spinner'

// The bottom status bar
const statusBarItem = window.createStatusBarItem(StatusBarAlignment.Left)
statusBarItem.show()
const statusKey = 'Jest:'
const frame = elegantSpinner()
let statusBarSpinner: any

export function registerStatusBar(statusBarCommand: string) {
  statusBarItem.command = statusBarCommand
}

export function initial() {
  updateStatus('...')
}

export function running(details?: string) {
  clearInterval(statusBarSpinner)
  statusBarSpinner = setInterval(() => {
    statusBarItem.text = `${statusKey} ${frame()} ${details || ''}`
  }, 100)
}

export function success(details?: string) {
  updateStatus('$(check)', details)
}

export function failed(details?: string) {
  updateStatus('$(alert)', details)
}

export function stopped(details?: string) {
  updateStatus('stopped', details)
}

function updateStatus(message: string, details?: string) {
  clearInterval(statusBarSpinner)
  statusBarItem.text = `${statusKey} ${message} ${details || ''}`
}
