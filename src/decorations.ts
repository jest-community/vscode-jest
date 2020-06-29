import {
  window,
  OverviewRulerLane,
  DecorationRangeBehavior,
  ExtensionContext,
  TextEditorDecorationType,
} from 'vscode';

function createTestStateDecoration(
  context: ExtensionContext,
  icon: string,
  overviewRulerColor: string
): TextEditorDecorationType {
  return window.createTextEditorDecorationType({
    overviewRulerColor,
    gutterIconPath: context.asAbsolutePath(`./src/icons/${icon}.svg`),
    overviewRulerLane: OverviewRulerLane.Left,
    rangeBehavior: DecorationRangeBehavior.ClosedClosed,
  });
}

export function passingItName(context: ExtensionContext): TextEditorDecorationType {
  return createTestStateDecoration(context, 'passing', 'green');
}

export function failingItName(context: ExtensionContext): TextEditorDecorationType {
  return createTestStateDecoration(context, 'failing', 'red');
}

export function skipItName(context: ExtensionContext): TextEditorDecorationType {
  return createTestStateDecoration(context, 'skip', 'yellow');
}

export function notRanItName(context: ExtensionContext): TextEditorDecorationType {
  return createTestStateDecoration(context, 'unknown', 'darkgrey');
}

export function failingAssertionStyle(text: string): TextEditorDecorationType {
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
