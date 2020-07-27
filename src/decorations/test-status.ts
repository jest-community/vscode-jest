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
import unknownIcon from './question.svg';
import { prepareIconFile } from '../helpers';

export class TestStatus {
  public passing: TextEditorDecorationType;
  public failing: TextEditorDecorationType;
  public skip: TextEditorDecorationType;
  public unknown: TextEditorDecorationType;

  constructor(context: ExtensionContext) {
    this.passing = this.createStateDecoration([
      prepareIconFile(context, 'passing', passingIcon, '#35A15E'),
      'green',
    ]);
    this.failing = this.createStateDecoration([
      prepareIconFile(context, 'failing', failingIcon, '#D6443C'),
      'red',
    ]);
    this.skip = this.createStateDecoration([
      prepareIconFile(context, 'skip', skipIcon, '#fed37f'),
      'yellow',
    ]);
    this.unknown = this.createStateDecoration(
      [prepareIconFile(context, 'unknown', unknownIcon, '#BBBBBB'), 'darkgrey'],
      [prepareIconFile(context, 'unknown-light', unknownIcon, '#555555')]
    );
  }

  private createStateDecoration(
    dark: /* default */ [string, string?],
    light?: /* optional overrides */ [string, string?]
  ): TextEditorDecorationType {
    const [icon, overviewRulerColor] = dark;
    const [iconLite, overviewRulerColorLite] = light ?? [];

    const options: DecorationRenderOptions = {
      gutterIconPath: icon,
      gutterIconSize: 'contain',
      overviewRulerLane: OverviewRulerLane.Left,
      rangeBehavior: DecorationRangeBehavior.ClosedClosed,
      dark: {
        gutterIconPath: icon,
      },
      light: {
        gutterIconPath: iconLite || icon,
      },
    };

    if (overviewRulerColor) {
      options['overviewRulerColor'] = overviewRulerColor;
      options['dark']['overviewRulerColor'] = overviewRulerColor;
    }

    if (overviewRulerColorLite) {
      options['light']['overviewRulerColor'] = overviewRulerColorLite;
    }

    return window.createTextEditorDecorationType(options);
  }
}
