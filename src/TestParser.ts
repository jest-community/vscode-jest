import { IParseResults, parse as parseJavaScript } from 'jest-editor-support'
import { parse as parseTypeScript } from 'jest-test-typescript-parser'

export function getParser(filePath: string): Function {
  const isTypeScript = filePath.match(/\.tsx?$/)
  return isTypeScript ? parseTypeScript : parseJavaScript
}

export function parseTest(filePath: string): IParseResults {
  const parser = getParser(filePath)
  return parser(filePath)
}
