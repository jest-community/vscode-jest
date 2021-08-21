import { JestProcess } from './JestProcess';
import { JestProcessRequest, Task, TaskPredicate } from './types';

export const isRequestEqual = (r1: JestProcessRequest, r2: JestProcessRequest): boolean => {
  switch (r1.type) {
    case 'by-file':
      return r2.type === r1.type && r1.testFileName === r2.testFileName;
    case 'by-file-pattern':
      return r2.type === r1.type && r1.testFileNamePattern === r2.testFileNamePattern;
    case 'by-file-test':
      return (
        r2.type === r1.type &&
        r1.testFileName === r2.testFileName &&
        r1.testNamePattern === r2.testNamePattern
      );
    case 'by-file-test-pattern':
      return (
        r2.type === r1.type &&
        r1.testFileNamePattern === r2.testFileNamePattern &&
        r1.testNamePattern === r2.testNamePattern
      );
    case 'not-test':
      return (
        r2.type === r1.type &&
        r1.args.length === r2.args.length &&
        r2.args.every((arg) => r1.args.includes(arg))
      );
    default:
      return r1.type === r2.type;
  }
};

export const isDup = (task: Task<JestProcess>, request: JestProcessRequest): boolean => {
  const process = task.data;
  if (!request.schedule.dedup) {
    return false;
  }
  const predicate: TaskPredicate = request.schedule.dedup;

  if (predicate.filterByStatus && !predicate.filterByStatus.includes(task.status)) {
    return false;
  }
  if (predicate.filterByContent !== false && !isRequestEqual(process.request, request)) {
    return false;
  }
  return true;
};

export const requestString = (request: JestProcessRequest): string => {
  const replacer = (key: string, value: unknown) => {
    if (key === 'listener') {
      return typeof value;
    }
    return value;
  };
  return JSON.stringify(request, replacer);
};
