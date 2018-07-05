/**
 * collection of functions to show messages with actions in a consistent manner
 */

import * as vscode from 'vscode'

export interface MessageAction {
  title: string
  action: () => void
}

export function systemErrorMessage(message: string, ...actions: Array<MessageAction>) {
  const msg = vscode.window.showErrorMessage(message, ...extractActionTitles(actions))
  if (msg) {
    msg.then(handleMessageActions(actions))
  }
}

export function systemWarningMessage(message: string, ...actions: Array<MessageAction>) {
  const msg = vscode.window.showWarningMessage(message, ...extractActionTitles(actions))
  if (msg) {
    msg.then(handleMessageActions(actions))
  }
}

// common actions
export const showTroubleshootingAction: MessageAction = {
  title: 'help',
  action: () => vscode.commands.executeCommand('vscode.open', vscode.Uri.parse(TroubleShootingURL)),
}

export const TroubleShootingURL = 'https://github.com/jest-community/vscode-jest/blob/master/README.md#troubleshooting'
//
// internal methods
//
function extractActionTitles(actions?: Array<MessageAction>): string[] {
  if (!actions || actions.length === 0) {
    return []
  }
  return actions.map(a => a.title)
}
function handleMessageActions(actions?: Array<MessageAction>): (action?: string) => void {
  return (action?: string) => {
    if (!action) {
      return
    }
    const found = actions.filter(a => a.title === action)
    if (found.length === 1) {
      found[0].action()
    } else {
      vscode.window.showWarningMessage(`unrecognized action ${action}`)
    }
  }
}
