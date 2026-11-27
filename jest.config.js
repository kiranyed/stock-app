/** @type {import('ts-jest').JestConfigWithTsJest} **/
module.exports = {
  testEnvironment: "node",
  preset: "ts-jest",
  testMatch: ["**/src/tests/**/*.test.ts"], // Make sure this path is correct
  // agent worktrees live under .claude/worktrees; don't run their copies of the tests.
  // Anchored to <rootDir>, since a worktree's own path contains /.claude/.
  testPathIgnorePatterns: ["/node_modules/", "<rootDir>/.claude/"],
  transform: {
    "^.+\\.tsx?$": "ts-jest",
  }
};