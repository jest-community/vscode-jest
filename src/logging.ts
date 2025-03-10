export type LoggingType = 'debug' | 'error' | 'warn';
export type Logging = (type: LoggingType, ...args: unknown[]) => void;
export interface LoggingFactory {
  create: (id: string) => Logging;
}

export const workspaceLogging = (workspaceName: string, verbose: boolean): LoggingFactory => {
  const create =
    (id: string): Logging =>
    (type: LoggingType, ...args: unknown[]): void => {
      const name = `[${workspaceName}/${id}]`;
      if (type === 'debug') {
        if (verbose) {
          console.log(name, ...args);
        }
        return;
      }
      if (type === 'warn') {
        console.warn(name, ...args);
        return;
      }

      console.error(name, ...args);
    };
  return { create };
};
