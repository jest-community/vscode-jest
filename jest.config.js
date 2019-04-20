module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  testRegex: "tests/.*\\.ts$",
  automock: true,
  moduleFileExtensions: ["ts", "js", "json"],
  setupFiles: ["./tests/jestSetup.js"],
};