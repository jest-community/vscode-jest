import {workspace} from 'vscode';

export function getPathToJest() {
	return workspace.getConfiguration('jest').get('pathToJest');
}

export function shouldStartOnActivate() {
	return workspace.getConfiguration('jest').get('watchOnProjectOpen');
}
