export enum WatchMode {
  None = 'none',
  Watch = 'watch',
  WatchAll = 'watchAll',
}

export const isWatchNotSupported = (str = '') =>
  new RegExp('^s*--watch is not supported without git/hg, please use --watchAlls*', 'im').test(str)
