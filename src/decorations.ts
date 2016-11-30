'use strict';

import * as vscode from 'vscode';

export function failingItName() {
    return vscode.window.createTextEditorDecorationType({
        overviewRulerColor: 'red',
        overviewRulerLane: vscode.OverviewRulerLane.Left,
        light: {
            before: {
                color: "#FF564B",
                contentText: "●",
            }
        },
        dark: {
            before: {
                color: "#AD322D",
                contentText: "●",
            }
        }
    });
}

export function passingItName() {
    return vscode.window.createTextEditorDecorationType({
        overviewRulerColor: 'green',
        overviewRulerLane: vscode.OverviewRulerLane.Left,
        light: {
            before: {
                color: "#3BB26B",
                contentText: "●" 
            }
        },
        dark: {
            before: {
                color: "#2F8F51",
                contentText: "●",
            }
        }
    });
}

export function notRanItName() {
    return vscode.window.createTextEditorDecorationType({
        overviewRulerColor: 'darkgrey',
        overviewRulerLane: vscode.OverviewRulerLane.Left,
        dark: {
            before: {
                color: "#3BB26B",
                contentText: "○",
            }    
        },
        light: {
            before: {
                color: "#2F8F51",
                contentText: "○",
            }    
        }
    });
}


export function failingAssertionStyle(text: string) {
    return vscode.window.createTextEditorDecorationType({
        isWholeLine: true,
        overviewRulerColor: 'red',
        overviewRulerLane: vscode.OverviewRulerLane.Left,
        light: {
            before: {
                color: "#FF564B",
            }
        },
        dark: {
            before: {
                color: "#AD322D",
            }
        },
        after: {
            contentText: " // " + text
        }
    });
}
