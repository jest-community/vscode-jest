'use strict';

import * as vscode from 'vscode';

export function failingItName() {
    return vscode.window.createTextEditorDecorationType({
        overviewRulerColor: 'red',
        overviewRulerLane: vscode.OverviewRulerLane.Left,
        before: {
            color: "red",
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


export function notRanItName() {
    return vscode.window.createTextEditorDecorationType({
        overviewRulerColor: 'darkgrey',
        overviewRulerLane: vscode.OverviewRulerLane.Left,
        dark: {
            before: {
                color: "darkgrey",
                contentText: "○",
            }    
        },
        light: {
            before: {
                color: "lightgrey",
                contentText: "○",
            }    

        }
        
    });
}