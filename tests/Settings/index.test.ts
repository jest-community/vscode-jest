jest.unmock('../../src/Settings');
import { isDefaultPathToJest } from '../../src/Settings';

describe('isDefaultPathToJest', () => {
  it('returns true when the value is null', () => {
    expect(isDefaultPathToJest(null)).toBe(true);
  });

  it('returns true for the legacy default ""', () => {
    expect(isDefaultPathToJest('')).toBe(true);
  });

  it('returns false otherwise', () => {
    expect(isDefaultPathToJest('something')).toBe(false);
  });
});
