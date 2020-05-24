jest.unmock('../../src/Jest');
import { isWatchNotSupported } from '../../src/Jest';

describe('isWatchNotSupported', () => {
  it('returns true when matching the expected message', () => {
    const str = '\n--watch is not supported without git/hg, please use --watchAll \n';
    expect(isWatchNotSupported(str)).toBe(true);
  });

  it('returns true when matching an "out of the repository" message', () => {
    const str = `
      Determining test suites to run...

      ● Test suite failed to run

        fatal: ../packages/a-dependency-outside-the-submodule: '../packages/a-dependency-outside-the-submodule' is outside repository`;
    expect(isWatchNotSupported(str)).toBe(true);
  });

  it('returns false otherwise', () => {
    expect(isWatchNotSupported()).toBe(false);
  });
});
