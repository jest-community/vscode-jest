jest.unmock('../../src/SideBar/TestResultTree')

import { TestResultFile } from '../../src/SideBar/TestResultTree'
import { JestFileResults } from '../../node_modules/jest-editor-support'

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
    const res = new TestResultFile(results)

    expect(res).toMatchObject({
      name: 'filename',
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
                },
                {
                  name: 'test3',
                  status: 'failed',
                  failureMessages: ['failure message 1', 'failure message 2'],
                },
              ],
            },
          ],
          tests: [
            {
              name: 'test1',
              status: 'pending',
            },
          ],
        },
      ],
    })
  })
})
