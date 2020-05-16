jest.disableAutomock()
import * as tr from '../../src/TestResults'

describe('TestResults', () => {
  describe('module.exports', () => {
    it('should match the snapshot', () => {
      expect(tr).toMatchSnapshot()
    })
  })
})
