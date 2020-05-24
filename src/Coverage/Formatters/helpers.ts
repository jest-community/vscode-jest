import { Location, Position } from 'istanbul-lib-coverage';

export function isValidPosition(p: Position) {
  return (p || false) && p.line !== null && p.line >= 0;
}

export function isValidLocation(l: Location) {
  return isValidPosition(l.start) && isValidPosition(l.end);
}
