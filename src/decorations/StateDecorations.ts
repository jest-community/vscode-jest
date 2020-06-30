import {
  window,
  OverviewRulerLane,
  DecorationRangeBehavior,
  ExtensionContext,
  TextEditorDecorationType,
  DecorationRenderOptions,
} from 'vscode';
import passingIcon from 'vscode-codicons/src/icons/check.svg';
import failingIcon from 'vscode-codicons/src/icons/chrome-close.svg';
import skipIcon from 'vscode-codicons/src/icons/debug-step-over.svg';
import unknownIcon from 'vscode-codicons/src/icons/question.svg';
import prepareIcon from './prepareIcon';

export class StateDecorations {
  public passing: TextEditorDecorationType;
  public failing: TextEditorDecorationType;
  public skip: TextEditorDecorationType;
  public unknown: TextEditorDecorationType;

  constructor(context: ExtensionContext) {
    this.passing = this.createStateDecoration([
      prepareIcon(context, 'passing', passingIcon, '#35A15E'),
      'green',
    ]);
    this.failing = this.createStateDecoration([
      prepareIcon(context, 'failing', failingIcon, '#D6443C'),
      'red',
    ]);
    this.skip = this.createStateDecoration([
      prepareIcon(context, 'skip', skipIcon, '#fed37f'),
      'yellow',
    ]);
    this.unknown = this.createStateDecoration(
      [prepareIcon(context, 'unknown', unknownIcon, '#BBBBBB'), 'darkgrey'],
      [prepareIcon(context, 'unknown-light', unknownIcon, '#555555')]
    );
  }

  private createStateDecoration(
    dark: /* default */ [string, string?],
    light?: /* optional overrides */ [string, string?]
  ): TextEditorDecorationType {
    const [icon, overviewRulerColor] = dark;

    const options: DecorationRenderOptions = {
      gutterIconPath: icon,
      gutterIconSize: 'contain',
      overviewRulerLane: OverviewRulerLane.Left,
      rangeBehavior: DecorationRangeBehavior.ClosedClosed,
      dark: {
        gutterIconPath: icon,
      },
      light: {
        gutterIconPath: light !== undefined ? light[0] : icon,
      },
    };

    if (overviewRulerColor) {
      options['overviewRulerColor'] = overviewRulerColor;
      options['dark']['overviewRulerColor'] = overviewRulerColor;
    }

    if (light !== undefined && light[1] !== undefined) {
      options['light']['overviewRulerColor'] = light[1];
    }

    return window.createTextEditorDecorationType(options);
  }

  public failingAssertionStyle(text: string): TextEditorDecorationType {
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
}
