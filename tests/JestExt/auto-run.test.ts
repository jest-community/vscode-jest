jest.unmock('../../src/JestExt/auto-run');
jest.unmock('../test-helper');

import { AutoRun } from '../../src/JestExt/auto-run';

describe('AutoRun', () => {
  it.each`
    case  | pluginSettings                                             | expectedConfig
    ${1}  | ${{ autoEnable: false }}                                   | ${{ watch: false }}
    ${2}  | ${{ autoEnable: true, runAllTestsFirst: true }}            | ${{ watch: true, onStartup: ['all-tests'] }}
    ${3}  | ${{ autoEnable: true, runAllTestsFirst: false }}           | ${{ watch: true }}
    ${4}  | ${{ autoEnable: true, autoRun: { watch: false } }}         | ${{ watch: false }}
    ${5}  | ${{ autoRun: 'default' }}                                  | ${{ watch: true }}
    ${6}  | ${{ autoRun: 'off' }}                                      | ${{ watch: false }}
    ${7}  | ${{ autoRun: 'watch' }}                                    | ${{ watch: true }}
    ${8}  | ${{ autoRun: 'legacy' }}                                   | ${{ watch: true, onStartup: ['all-tests'] }}
    ${9}  | ${{ autoRun: 'on-save' }}                                  | ${{ watch: false, onSave: 'test-src-file' }}
    ${10} | ${{ autoRun: 'bad-string' }}                               | ${{ watch: true }}
    ${11} | ${{ autoRun: { watch: false, onStartup: ['all-tests'] } }} | ${{ watch: false, onStartup: ['all-tests'] }}
  `('construct AutoRun from user settings: $case', ({ pluginSettings, expectedConfig }) => {
    const { autoRun, autoEnable, runAllTestsFirst } = pluginSettings;
    const ar = new AutoRun(autoRun, autoEnable, runAllTestsFirst);
    expect(ar.config).toEqual(expectedConfig);
  });

  it.each`
    autoRunConfig                                | mode
    ${'off'}                                     | ${'auto-run-off'}
    ${{}}                                        | ${'auto-run-off'}
    ${{ watch: true }}                           | ${'auto-run-watch'}
    ${{ watch: false }}                          | ${'auto-run-off'}
    ${{ watch: false, onSave: undefined }}       | ${'auto-run-off'}
    ${{ watch: false, onSave: 'test-file' }}     | ${'auto-run-on-save-test'}
    ${{ watch: false, onSave: 'test-src-file' }} | ${'auto-run-on-save'}
  `('$autoRunConfig => $mode', ({ autoRunConfig, mode }) => {
    const autoRun = new AutoRun(autoRunConfig);
    expect(autoRun.mode).toEqual(mode);
  });
  it.each`
    autoRunConfig                                                      | accessor
    ${{ watch: false }}                                                | ${{ isOff: true }}
    ${{ watch: true }}                                                 | ${{ isOff: false, isWatch: true }}
    ${{ watch: true, onStartup: ['all-tests'] }}                       | ${{ isOff: false, isWatch: true, onStartup: ['all-tests'] }}
    ${{ watch: false, onStartup: ['all-tests'] }}                      | ${{ isOff: false, isWatch: false, onStartup: ['all-tests'] }}
    ${{ watch: false, onStartup: ['all-tests'], onSave: 'test-file' }} | ${{ isOff: false, isWatch: false, onStartup: ['all-tests'], onSave: 'test-file' }}
    ${{ watch: false, onSave: 'test-src-file' }}                       | ${{ isOff: false, isWatch: false, onSave: 'test-src-file' }}
  `('check accessor for config: $autoRunConfig', ({ autoRunConfig, accessor }) => {
    const autoRun = new AutoRun(autoRunConfig);
    expect(autoRun.isOff).toEqual(accessor.isOff);
    expect(autoRun.isWatch).toEqual(accessor.isWatch ?? false);
    expect(autoRun.onStartup).toEqual(accessor.onStartup);
    expect(autoRun.onSave).toEqual(accessor.onSave);
    expect(autoRun.config).toEqual(autoRunConfig);
  });
  it('can toggle off at run time', () => {
    const original: any = { watch: true, onStartup: ['all-tests'] };
    const autoRun = new AutoRun(original);
    expect(autoRun.isOff).toBe(false);
    expect(autoRun.config).toEqual(original);

    autoRun.toggle();
    expect(autoRun.isOff).toBe(true);
    expect(autoRun.config).toEqual({ watch: false });

    autoRun.toggle();
    expect(autoRun.isOff).toBe(false);
    expect(autoRun.config).toEqual(original);
  });
  it('for original settog "off", toggle on means to switch to "on-save" mode', () => {
    const original: any = { watch: false };
    const autoRun = new AutoRun(original);
    expect(autoRun.isOff).toBe(true);
    expect(autoRun.config).toEqual(original);

    autoRun.toggle();
    expect(autoRun.isOff).toBe(false);
    expect(autoRun.config).toEqual({ watch: false, onSave: 'test-src-file' });

    autoRun.toggle();
    expect(autoRun.isOff).toBe(true);
    expect(autoRun.config).toEqual(original);
  });
});
