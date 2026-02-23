const nextJest = require("next/jest");

const createJestConfig = nextJest({ dir: "./" });

const config = {
    coverageProvider: "v8",
    testEnvironment: "jsdom",
    setupFilesAfterFramework: ["@testing-library/jest-dom"],
    moduleNameMapper: { "^@/(.*)$": "<rootDir>/src/$1" },
};

module.exports = createJestConfig(config);
