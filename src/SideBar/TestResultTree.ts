import { JestFileResults, JestAssertionResults } from 'jest-editor-support'
import { TestResult } from '../TestResults'

export class TestResultFile {
  name: string
  suite: TestResultSuite

  constructor(results: JestFileResults, parsedResults: TestResult[]) {
    this.name = results.name
    this.suite = new TestResultSuite()
    results.assertionResults.forEach(r => this.parseAssertionResults(r, parsedResults))
  }

  private parseAssertionResults(results: JestAssertionResults, parsedResults: TestResult[]) {
    const suite = this.getSuite((<any>results).ancestorTitles)
    const parsedResult = parsedResults.find(pr => pr.name === results.title)
    const line = parsedResult
      ? results.status === 'failed' && parsedResult.lineNumberOfError
        ? parsedResult.lineNumberOfError
        : parsedResult.start.line
      : 0
    suite.addTest(results, this.name, line)
  }

  private getSuite(titles: string[] | undefined, parentSuite: TestResultSuite = this.suite): TestResultSuite {
    if (titles === undefined || titles.length === 0) {
      return parentSuite
    }
    const suite = parentSuite.suites.find(s => s.name === titles[0])
    if (suite !== undefined) {
      return this.getSuite(titles.slice(1), suite)
    }

    return titles.map(t => new TestResultSuite(t)).reduce((a, s) => {
      a.suites.push(s)
      return s
    }, parentSuite)
  }
}

export class TestResultSuite {
  suites: TestResultSuite[]
  tests: TestResultTest[]

  constructor(public name: string = '') {
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
