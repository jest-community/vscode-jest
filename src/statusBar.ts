import { window, StatusBarAlignment } from 'vscode';

import * as elegantSpinner from 'elegant-spinner';

// The bottom status bar
const statusBarItem = window.createStatusBarItem(StatusBarAlignment.Left);
statusBarItem.show();
statusBarItem.command = 'io.orta.show-jest-output';
const statusKey = 'Jest:';
const frame = elegantSpinner();
let statusBarSpinner: NodeJS.Timer;

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
