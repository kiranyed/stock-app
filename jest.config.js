/** @type {import('ts-jest').JestConfigWithTsJest} **/
module.exports = {
  testEnvironment: "node",
  preset: "ts-jest",
  testMatch: ["**/src/tests/**/*.test.ts"], // Make sure this path is correct
  transform: {
    "^.+\\.tsx?$": "ts-jest",
  }
};