jest.disableAutomock()
import * as Coverage from '../../src/Coverage'

describe('Coverage', () => {
  describe('module.exports', () => {
    it('should match the snapshot', () => {
      expect(Coverage).toMatchSnapshot()
    })
  })
})
