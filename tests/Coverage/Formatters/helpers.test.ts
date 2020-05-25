jest.unmock('../../../src/Coverage/Formatters/helpers');
import { isValidPosition, isValidLocation } from '../../../src/Coverage/Formatters/helpers';

describe('Coverage Formatters helpers', () => {
  describe('isValidPosition()', () => {
    it('should return false when the position is falsy', () => {
      expect(isValidPosition(undefined)).toBe(false);
    });

    it('should return false when the line number is undefined', () => {
      const position: any = {};
      expect(isValidPosition(position)).toBe(false);
    });

    it('should return false when the line number is null', () => {
      const position: any = { line: null };
      expect(isValidPosition(position)).toBe(false);
    });

    it('should return false when the line number is less than zero', () => {
      const position: any = { line: -1 };
      expect(isValidPosition(position)).toBe(false);
    });

    it('should return false when the line number is zero or more', () => {
      let position: any = { line: 0 };
      expect(isValidPosition(position)).toBe(true);

      position = { line: 1 };
      expect(isValidPosition(position)).toBe(true);
    });
  });

  describe('isValidLocation()', () => {
    it('should return false when the start is not valid', () => {
      const location: any = {};
      expect(isValidLocation(location)).toBe(false);
    });

    it('should return false when the end is not valid', () => {
      const location: any = {
        start: { line: 2 },
      };
      expect(isValidLocation(location)).toBe(false);
    });

    it('should return true when the start and end positions are valid', () => {
      const location: any = {
        start: { line: 2 },
        end: { line: 6 },
      };
      expect(isValidLocation(location)).toBe(true);
    });
  });
});
