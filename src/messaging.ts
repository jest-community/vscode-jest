/**
 * collection of functions to show messages with actions in a consistent manner
 */

import * as vscode from 'vscode';

export const TROUBLESHOOTING_URL =
  'https://github.com/jest-community/vscode-jest/blob/master/README.md#troubleshooting';
export const LONG_RUN_TROUBLESHOOTING_URL =
  'https://github.com/jest-community/vscode-jest/blob/master/README.md#what-to-do-with-long-running-tests-warning';

//
// internal methods
//
function _extractActionTitles(actions?: MessageAction[]): string[] {
  return actions ? actions.map((a) => a.title) : [];
}
// expose the internal function so we can unit testing it
// eslint-disable-next-line @typescript-eslint/no-empty-function
const doNothing = () => {};
export function _handleMessageActions(actions?: MessageAction[]): (action?: string) => void {
  if (!actions || actions.length <= 0) {
    return doNothing;
  }
  return (action?: string) => {
    if (!action) {
      return;
    }
    const found = actions.filter((a) => a.title === action);
    if (found.length === 1) {
      found[0].action();
    } else {
      throw Error(
        `expect exactly one matched action '${action}' but found ${found.length} match(es)`
      );
    }
  };
}

export interface MessageAction {
  title: string;
  action: () => void;
}

export function systemErrorMessage(message: string, ...actions: MessageAction[]): void {
  vscode.window
    .showErrorMessage(message, ..._extractActionTitles(actions))
    .then(_handleMessageActions(actions));
}

export function systemWarningMessage(message: string, ...actions: MessageAction[]): void {
  vscode.window
    .showWarningMessage(message, ..._extractActionTitles(actions))
    .then(_handleMessageActions(actions));
}

// common actions
export const showTroubleshootingAction: MessageAction = {
  title: 'Help',
  action: () =>
    vscode.commands.executeCommand('vscode.open', vscode.Uri.parse(TROUBLESHOOTING_URL)),
};
export const showLongRunTroubleshootingAction: MessageAction = {
  title: 'Help',
  action: () =>
    vscode.commands.executeCommand('vscode.open', vscode.Uri.parse(LONG_RUN_TROUBLESHOOTING_URL)),
};
