'use strict';

import * as vscode from 'vscode';

export function unknownItName() {
    return vscode.window.createTextEditorDecorationType({
        borderWidth: '1px',
        borderStyle: 'solid',
        light: {
            // this color will be used in light color themes
            borderColor: 'black'
        },
        dark: {
            // this color will be used in dark color themes
            borderColor: 'black'
        },
        before: {
            contentText: "F",
            border: "white",
            backgroundColor: "black",
            width: "20"
        }
    });
}

export function failingItName() {
    return vscode.window.createTextEditorDecorationType({
        overviewRulerColor: 'red',
        overviewRulerLane: vscode.OverviewRulerLane.Left,
        before: {
            color: "green",
            contentText: "●",
        }
    });
}

export function passingItName() {
    return vscode.window.createTextEditorDecorationType({
        overviewRulerColor: 'green',
        overviewRulerLane: vscode.OverviewRulerLane.Left,
        before: {
            color: "green",
            contentText: "●",
        }
    });
}

