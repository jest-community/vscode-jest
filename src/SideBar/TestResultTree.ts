import { JestFileResults, JestAssertionResults } from 'jest-editor-support'
import { TestResult } from '../TestResults'

export class TestResultFile {
  name: string
  suites: TestResultSuite[]

  constructor(results: JestFileResults, parsedResults: TestResult[]) {
    this.name = results.name
    this.suites = []
    results.assertionResults.forEach(r => this.parseAssertionResults(r, parsedResults))
  }

  private parseAssertionResults(results: JestAssertionResults, parsedResults: TestResult[]) {
    const suite = this.getSuite((<any>results).ancestorTitles, this.suites)
    const parsedResult = parsedResults.find(pr => pr.name === results.title)
    const line = parsedResult
      ? results.status === 'failed' && parsedResult.lineNumberOfError
        ? parsedResult.lineNumberOfError
        : parsedResult.start.line
      : 0
    suite.addTest(results, this.name, line)
  }

  private getSuite(titles: string[], suites: TestResultSuite[]): TestResultSuite {
    let suite = suites.find(s => s.name === titles[0])
    if (suite !== undefined) {
      if (titles.length > 1) {
        return this.getSuite(titles.slice(1), suite.suites)
      }
      return suite
    }

    titles.forEach(t => {
      suite = new TestResultSuite(t)
      suites.push(suite)
      suites = suite.suites
    })
    return suite
  }
}

export class TestResultSuite {
  suites: TestResultSuite[]
  tests: TestResultTest[]

  constructor(public name: string) {
    this.suites = []
    this.tests = []
  }

  addTest(results: JestAssertionResults, filename: string, line: number) {
    this.tests.push(new TestResultTest(results, filename, line))
  }
}

export class TestResultTest {
  name: string
  status: 'failed' | 'passed' | 'pending'
  failureMessages: string[]
  filename: string
  line: number

  constructor(results: JestAssertionResults, filename: string, line: number) {
    this.name = results.title
    this.status = results.status
    this.failureMessages = results.failureMessages
    this.filename = filename
    this.line = line
  }
}
