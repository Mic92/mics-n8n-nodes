module.exports = {
  preset: "ts-jest",
  testEnvironment: "node",
  testMatch: ["**/*.test.ts"],
  testPathIgnorePatterns: ["/node_modules/", "/dist/"],
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
  verbose: true,
};
