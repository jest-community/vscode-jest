import {window, workspace} from 'vscode'

const NODE_NOT_FOUND = '[Jest] Cannot find node in PATH. The simpliest way to resolve it is install node globally'
const JEST_NOT_FOUND = '[Jest] Cannot find flow in PATH. Ensure it is at: ' + getPathToJest()

export function getPathToJest() {
	return workspace.getConfiguration('jest').get('pathToJest')
}

export function shouldStartOnActivate() {
	return workspace.getConfiguration('jest').get('watchOnProjectOpen')
}
