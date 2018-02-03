jest.disableAutomock()

describe('Coverage', () => {
  describe('module.exports', () => {
    it('should match the snapshot', () => {
      expect(require('../../src/Coverage')).toMatchSnapshot()
    })
  })
})
