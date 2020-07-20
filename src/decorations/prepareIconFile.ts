import * as path from 'path';
import * as fs from 'fs';
import { ExtensionContext } from 'vscode';
const ICONS_PATH = path.join('generated-icons');

/**
 * NOTE: Should not be called repeatedly for the performance reasons. Cache your results.
 */
function prepareIconFile(
  context: ExtensionContext,
  iconName: string,
  source: string,
  color?: string
): string {
  const resolvePath = (...args: string[]): string => {
    return context.asAbsolutePath(path.join(...args));
  };

  const resultIconPath = resolvePath(ICONS_PATH, `${iconName}.svg`);
  let result = source.toString();

  if (color) {
    result = result.replace('fill="currentColor"', `fill="${color}"`);
  }

  if (!fs.existsSync(resultIconPath) || fs.readFileSync(resultIconPath).toString() !== result) {
    if (!fs.existsSync(resolvePath(ICONS_PATH))) {
      fs.mkdirSync(resolvePath(ICONS_PATH));
    }

    fs.writeFileSync(resultIconPath, result);
  }

  return resultIconPath;
}

export default prepareIconFile;
