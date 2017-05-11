import { window, StatusBarAlignment, commands, OutputChannel } from 'vscode';
import * as elegantSpinner from 'elegant-spinner';

import { extensionName } from './appGlobals';

// The bottom status bar
const statusBarCommand = `${extensionName}.show-output`;
const statusBarItem = window.createStatusBarItem(StatusBarAlignment.Left);
statusBarItem.show();
statusBarItem.command = statusBarCommand;
const statusKey = 'Jest:';
const frame = elegantSpinner();
let statusBarSpinner: any;

export function registerStatusBar(channel: OutputChannel) {
    return commands.registerCommand(
        statusBarCommand,
        () => channel.show(),
    );
}

export function initial() {
    updateStatus('...');
}

export function running() {
    clearInterval(statusBarSpinner);
    statusBarSpinner = setInterval(() => {
        statusBarItem.text = `${statusKey} ${frame()}`;
    }, 100);
}

export function success() {
    updateStatus('$(check)');
}

export function failed() {
    updateStatus('$(alert)');
}

export function stopped() {
    updateStatus('stopped');
    setTimeout(() => initial(), 2000);
}

function updateStatus(message: string) {
    clearInterval(statusBarSpinner);
    statusBarItem.text = `${statusKey} ${message}`;
}
