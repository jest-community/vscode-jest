import { Location, Range } from 'istanbul-lib-coverage';

export function isValidPosition(p: Location): boolean {
  return (p || false) && p.line !== null && p.line >= 0;
}

export function isValidLocation(l: Range): boolean {
  return isValidPosition(l.start) && isValidPosition(l.end);
}
