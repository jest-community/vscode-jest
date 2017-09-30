import { window, StatusBarAlignment, commands, OutputChannel } from 'vscode'
import * as elegantSpinner from 'elegant-spinner'

import { extensionName } from './appGlobals'

// The bottom status bar
const statusBarCommand = `${extensionName}.show-output`
const statusBarItem = window.createStatusBarItem(StatusBarAlignment.Left)
statusBarItem.show()
statusBarItem.command = statusBarCommand
const statusKey = 'Jest:'
const frame = elegantSpinner()
let statusBarSpinner: any

export function registerStatusBar(channel: OutputChannel) {
  return commands.registerCommand(statusBarCommand, () => channel.show())
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
  setTimeout(() => initial(), 2000)
}

function updateStatus(message: string, details?: string) {
  clearInterval(statusBarSpinner)
  statusBarItem.text = `${statusKey} ${message} ${details || ''}`
}
