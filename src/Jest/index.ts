export enum WatchMode {
  None = 'none',
  Watch = 'watch',
  WatchAll = 'watchAll',
}

const IS_OUTSIDE_REPOSITORY_REGEXP = /Test suite failed to run[\s\S]*fatal:[\s\S]*is outside repository/im;
const WATCH_IS_NOT_SUPPORTED_REGEXP = /^s*--watch is not supported without git\/hg, please use --watchAlls*/im;

export const isWatchNotSupported = (str = '') =>
  IS_OUTSIDE_REPOSITORY_REGEXP.test(str) || WATCH_IS_NOT_SUPPORTED_REGEXP.test(str);
