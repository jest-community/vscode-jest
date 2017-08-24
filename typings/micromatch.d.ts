declare module 'micromatch' {
  type MatchFunction<T> = ((value: T) => boolean)
  function matcher(pattern: string, options: any): MatchFunction<string>
}
