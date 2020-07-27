import { window, TextEditorDecorationType, OverviewRulerLane } from 'vscode';

const inlineError = (text: string): TextEditorDecorationType => {
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
};

export default inlineError;
