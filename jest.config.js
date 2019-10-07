module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  testRegex: "tests/.*\\.ts$",
  automock: true,
  moduleFileExtensions: ["ts", "js", "json"],
  unmockedModulePathPatterns: [
    "jest-editor-support/node_modules/",
    "@babel/traverse/node_modules",
    "realpath-native"
  ],
};