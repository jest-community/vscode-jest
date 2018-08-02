import { JestFileResults, JestAssertionResults } from 'jest-editor-support'

export class TestResultFile {
  name: string
  suites: TestResultSuite[]

  constructor(results: JestFileResults) {
    this.name = results.name
    this.suites = []
    results.assertionResults.forEach(r => this.parseAssertionResults(r))
  }

  private parseAssertionResults(results: JestAssertionResults) {
    const suite = this.getSuite((<any>results).ancestorTitles, this.suites)
    suite.addTest(results, this.name, 0)
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
