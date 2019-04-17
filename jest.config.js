module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  testRegex: "tests/.*\\.ts$",
  automock: true,
  moduleFileExtensions: ["ts", "js", "json"],
  setupFiles: ["./tests/jestSetup.js"],
  moduleNameMapper: {
    "^color-convert$": "<rootDir>/node_modules/color-convert",
    "^chalk$": "<rootDir>/node_modules/chalk",
    "^@babel/traverse$": "<rootDir>/node_modules/@babel/traverse",
    "^snapdragon$": "<rootDir>/node_modules/snapdragon",
  },
};