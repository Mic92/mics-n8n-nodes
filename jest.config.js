const sharedTransform = {
  "^.+\\.tsx?$": [
    "ts-jest",
    {
      tsconfig: {
        esModuleInterop: true,
        allowSyntheticDefaultImports: true,
      },
    },
  ],
};

module.exports = {
  projects: [
    // All packages except CalDAV — plain unit tests, no external services.
    {
      displayName: "unit",
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
        ...sharedTransform,
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
      verbose: true,
    },

    // CalDAV — integration tests that need a Radicale server.
    {
      displayName: "caldav",
      preset: "ts-jest",
      testEnvironment: "node",
      testMatch: ["<rootDir>/packages/n8n-nodes-caldav/**/*.test.ts"],
      testPathIgnorePatterns: ["/node_modules/", "/dist/"],
      globalSetup:
        "<rootDir>/packages/n8n-nodes-caldav/test/globalSetup.ts",
      globalTeardown:
        "<rootDir>/packages/n8n-nodes-caldav/test/globalTeardown.ts",
      transform: sharedTransform,
      testTimeout: 30000,
      verbose: true,
    },
  ],
};
