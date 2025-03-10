jest.unmock('../src/logging');

import { workspaceLogging } from '../src/logging';

describe('workspaceLogging creates a logger factory', () => {
  beforeEach(() => {
    console.error = jest.fn();
    console.log = jest.fn();
    console.warn = jest.fn();
  });
  it('to apply workspace name for subsequent logger', () => {
    const factory = workspaceLogging('workspace-1', true);
    const logging = factory.create('child');
    logging('error', 'some error');
    expect(console.error).toHaveBeenCalledWith('[workspace-1/child]', 'some error');
    logging('warn', 'some warning');
    expect(console.warn).toHaveBeenCalledWith('[workspace-1/child]', 'some warning');
    logging('debug', 'some debug message');
    expect(console.log).toHaveBeenCalledWith('[workspace-1/child]', 'some debug message');
  });
  it('to turn on/off debug message for subsequent logger', () => {
    let factory = workspaceLogging('workspace-1', true);
    let logging = factory.create('child');
    logging('debug', 'some debug message');
    expect(console.log).toHaveBeenCalledWith('[workspace-1/child]', 'some debug message');
    (console.log as jest.Mocked<any>).mockClear();

    factory = workspaceLogging('workspace-1', false);
    logging = factory.create('child');
    logging('debug', 'some debug message');
    expect(console.log).not.toHaveBeenCalled();
  });
});
