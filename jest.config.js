module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  testRegex: 'tests/.*\\.test\\.ts$',
  collectCoverageFrom: ['src/**/*.ts'],
  automock: true,
  moduleFileExtensions: ['ts', 'js', 'json'],
  unmockedModulePathPatterns: [
    'jest-editor-support/node_modules',
    'color-convert',
    'chalk',
    'snapdragon',
    'ansi-styles',
    'core-js',
    'debug',
    '@babel/template',
  ],
};
