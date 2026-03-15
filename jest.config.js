// CalDAV tests live in packages/n8n-nodes-caldav/jest.config.js because
// they need globalSetup/globalTeardown for Radicale.  Jest validates
// globalSetup paths at startup even with --selectProjects, so keeping
// them here would break nix builds of other packages (where the caldav
// source tree is absent from the sandbox).
//
// Run CalDAV tests via:
//   npx jest --config packages/n8n-nodes-caldav/jest.config.js
// Run everything:
//   npx jest && npx jest --config packages/n8n-nodes-caldav/jest.config.js

module.exports = {
  preset: "ts-jest",
  testEnvironment: "node",
  testMatch: ["<rootDir>/packages/**/*.test.ts"],
  testPathIgnorePatterns: [
    "/node_modules/",
    "/dist/",
    "/packages/n8n-nodes-caldav/",
  ],
  collectCoverageFrom: ["packages/**/nodes/**/*.ts"],
  coveragePathIgnorePatterns: ["/node_modules/", "/dist/", "/test/"],
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
    // nostr-tools and @noble/* ship ESM .js; transpile them for Jest/CJS
    "node_modules/(@noble|@scure|nostr-tools)/.+\\.js$": [
      "ts-jest",
      {
        tsconfig: {
          esModuleInterop: true,
          allowJs: true,
          allowSyntheticDefaultImports: true,
        },
      },
    ],
  },
  transformIgnorePatterns: ["node_modules/(?!nostr-tools|@noble|@scure)"],
  testTimeout: 10000,
};
