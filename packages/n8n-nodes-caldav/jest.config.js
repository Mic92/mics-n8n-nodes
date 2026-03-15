// Standalone config for CalDAV integration tests.
//
// Separate from the root jest.config.js because Jest validates
// globalSetup paths at startup, and in nix builds of other packages
// the caldav source tree is absent from the sandbox.

module.exports = {
  preset: "ts-jest",
  testEnvironment: "node",
  rootDir: "../..",
  testMatch: ["<rootDir>/packages/n8n-nodes-caldav/**/*.test.ts"],
  testPathIgnorePatterns: ["/node_modules/", "/dist/"],
  globalSetup: "<rootDir>/packages/n8n-nodes-caldav/test/globalSetup.ts",
  globalTeardown: "<rootDir>/packages/n8n-nodes-caldav/test/globalTeardown.ts",
  transform: {
    "^.+\\.tsx?$": [
      "ts-jest",
      {
        tsconfig: {
          esModuleInterop: true,
          allowSyntheticDefaultImports: true,
        },
      },
    ],
  },
  testTimeout: 30000,
};
