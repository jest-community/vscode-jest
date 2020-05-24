import { window, OverviewRulerLane, DecorationRangeBehavior } from 'vscode';

export function failingItName() {
  return window.createTextEditorDecorationType({
    overviewRulerColor: 'red',
    overviewRulerLane: OverviewRulerLane.Left,
    light: {
      before: {
        color: '#FF564B',
        contentText: '✘ ',
      },
    },
    dark: {
      before: {
        color: '#AD322D',
        contentText: '✘ ',
      },
    },
    rangeBehavior: DecorationRangeBehavior.ClosedClosed,
  });
}

export function skipItName() {
  return window.createTextEditorDecorationType({
    overviewRulerColor: 'yellow',
    overviewRulerLane: OverviewRulerLane.Left,
    light: {
      before: {
        color: '#fed37f',
        contentText: '○ ',
      },
    },
    dark: {
      before: {
        color: '#fed37f',
        contentText: '○ ',
      },
    },
    rangeBehavior: DecorationRangeBehavior.ClosedClosed,
  });
}

export function passingItName() {
  return window.createTextEditorDecorationType({
    overviewRulerColor: 'green',
    overviewRulerLane: OverviewRulerLane.Left,
    light: {
      before: {
        color: '#3BB26B',
        contentText: '✔ ',
      },
    },
    dark: {
      before: {
        color: '#2F8F51',
        contentText: '✔ ',
      },
    },
    rangeBehavior: DecorationRangeBehavior.ClosedClosed,
  });
}

export function notRanItName() {
  return window.createTextEditorDecorationType({
    overviewRulerColor: 'darkgrey',
    overviewRulerLane: OverviewRulerLane.Left,
    dark: {
      before: {
        color: '#9C9C9C',
        contentText: '○ ',
      },
    },
    light: {
      before: {
        color: '#7C7C7C',
        contentText: '○ ',
      },
    },
    rangeBehavior: DecorationRangeBehavior.ClosedClosed,
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
      },
      after: {
        color: '#FF564B',
        contentText: ' // ' + text,
      },
    },
    dark: {
      before: {
        color: '#AD322D',
      },
      after: {
        color: '#AD322D',
        contentText: ' // ' + text,
      },
    },
  });
}
