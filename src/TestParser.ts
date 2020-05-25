import { IParseResults, parse } from 'jest-editor-support';

export function parseTest(filePath: string): IParseResults {
  return parse(filePath);
}
