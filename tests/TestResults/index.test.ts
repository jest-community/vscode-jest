jest.disableAutomock()

describe('TestResults', () => {
  describe('module.exports', () => {
    it('should match the snapshot', () => {
      expect(require('../../src/TestResults')).toMatchSnapshot()
    })
  })
})
