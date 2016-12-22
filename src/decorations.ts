import { window, OverviewRulerLane } from 'vscode';

export function failingItName() {
    return window.createTextEditorDecorationType({
        overviewRulerColor: 'red',
        overviewRulerLane: OverviewRulerLane.Left,
        light: {
            before: {
                color: '#FF564B',
                contentText: '●',
            }
        },
        dark: {
            before: {
                color: '#AD322D',
                contentText: '●',
            }
        }
    });
}

export function passingItName() {
    return window.createTextEditorDecorationType({
        overviewRulerColor: 'green',
        overviewRulerLane: OverviewRulerLane.Left,
        light: {
            before: {
                color: '#3BB26B',
                contentText: '●' 
            }
        },
        dark: {
            before: {
                color: '#2F8F51',
                contentText: '●',
            }
        }
    });
}

export function notRanItName() {
    return window.createTextEditorDecorationType({
        overviewRulerColor: 'darkgrey',
        overviewRulerLane: OverviewRulerLane.Left,
        dark: {
            before: {
                color: '#3BB26B',
                contentText: '○',
            }    
        },
        light: {
            before: {
                color: '#2F8F51',
                contentText: '○',
            }    
        }
    });
}


export function failingAssertionStyle(text: string) {
    return window.createTextEditorDecorationType({
        isWholeLine: true,
        overviewRulerColor: 'red',
        overviewRulerLane: OverviewRulerLane.Left,
        light: {
            before: {
                color: '#FF564B',
            }
        },
        dark: {
            before: {
                color: '#AD322D',
            }
        },
        after: {
            contentText: ' // ' + text
        }
    });
}
