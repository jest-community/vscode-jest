jest.unmock('../../src/SideBar/TestResultTree')

import { TestResultFile } from '../../src/SideBar/TestResultTree'
import { JestFileResults } from '../../node_modules/jest-editor-support'
import { TestResult } from '../../src/TestResults'

describe('TestResultFile', () => {
  it('should parse results', () => {
    const results: JestFileResults = jest.fn<JestFileResults>(() => {
      return {
        name: 'filename',
        assertionResults: [
          {
            title: 'test1',
            status: 'pending',
            ancestorTitles: ['desc1'],
          },
          {
            title: 'test2',
            status: 'passed',
            ancestorTitles: ['desc1', 'desc2'],
          },
          {
            title: 'test3',
            status: 'failed',
            ancestorTitles: ['desc1', 'desc2'],
            failureMessages: ['failure message 1', 'failure message 2'],
          },
        ],
      }
    })()

    const parsedResults: TestResult[] = [
      {
        name: 'test1',
        start: { column: 4, line: 1 },
        end: { column: 6, line: 3 },
        status: 'Unknown',
        lineNumberOfError: 3,
      },
      {
        name: 'test2',
        start: { column: 4, line: 5 },
        end: { column: 6, line: 8 },
        status: 'Unknown',
        lineNumberOfError: 7,
      },
      {
        name: 'test3',
        start: { column: 4, line: 11 },
        end: { column: 7, line: 13 },
        status: 'Unknown',
        lineNumberOfError: 11,
      },
    ]

    const res = new TestResultFile(results, parsedResults)

    expect(res).toMatchObject({
      name: 'filename',
      suite: {
        name: '',
        suites: [
          {
            name: 'desc1',
            suites: [
              {
                name: 'desc2',
                suites: [],
                tests: [
                  {
                    name: 'test2',
                    status: 'passed',
                    filename: 'filename',
                    line: 5,
                  },
                  {
                    name: 'test3',
                    status: 'failed',
                    failureMessages: ['failure message 1', 'failure message 2'],
                    filename: 'filename',
                    line: 11,
                  },
                ],
              },
            ],
            tests: [
              {
                name: 'test1',
                status: 'pending',
                filename: 'filename',
                line: 1,
              },
            ],
          },
        ],
        tests: [],
      },
    })
  })

  it('should parse results of root tests', () => {
    const results: JestFileResults = jest.fn<JestFileResults>(() => {
      return {
        name: 'filename',
        assertionResults: [
          {
            title: 'test1',
            status: 'pending',
            ancestorTitles: [],
          },
          {
            title: 'test2',
            status: 'passed',
            ancestorTitles: undefined,
          },
        ],
      }
    })()

    const parsedResults: TestResult[] = [
      {
        name: 'test1',
        start: { column: 4, line: 1 },
        end: { column: 6, line: 3 },
        status: 'Unknown',
        lineNumberOfError: 3,
      },
      {
        name: 'test2',
        start: { column: 4, line: 5 },
        end: { column: 6, line: 8 },
        status: 'Unknown',
        lineNumberOfError: 7,
      },
    ]

    const res = new TestResultFile(results, parsedResults)

    expect(res).toMatchObject({
      name: 'filename',
      suite: {
        name: '',
        suites: [],
        tests: [
          {
            name: 'test1',
            status: 'pending',
            filename: 'filename',
            line: 1,
          },
          {
            name: 'test2',
            status: 'passed',
            filename: 'filename',
            line: 5,
          },
        ],
      },
    })
  })

  it('should parse results of multiple root describes', () => {
    const results: JestFileResults = jest.fn<JestFileResults>(() => {
      return {
        name: 'filename',
        assertionResults: [
          {
            title: 'test1',
            status: 'pending',
            ancestorTitles: ['desc1'],
          },
          {
            title: 'test2',
            status: 'passed',
            ancestorTitles: ['desc2'],
          },
        ],
      }
    })()

    const parsedResults: TestResult[] = [
      {
        name: 'test1',
        start: { column: 4, line: 1 },
        end: { column: 6, line: 3 },
        status: 'Unknown',
        lineNumberOfError: 3,
      },
      {
        name: 'test2',
        start: { column: 4, line: 5 },
        end: { column: 6, line: 8 },
        status: 'Unknown',
        lineNumberOfError: 7,
      },
    ]

    const res = new TestResultFile(results, parsedResults)

    expect(res).toMatchObject({
      name: 'filename',
      suite: {
        name: '',
        suites: [
          {
            name: 'desc1',
            suites: [],
            tests: [
              {
                name: 'test1',
                status: 'pending',
                filename: 'filename',
                line: 1,
              },
            ],
          },
          {
            name: 'desc2',
            suites: [],
            tests: [
              {
                name: 'test2',
                status: 'passed',
                filename: 'filename',
                line: 5,
              },
            ],
          },
        ],
        tests: [],
      },
    })
  })
})
