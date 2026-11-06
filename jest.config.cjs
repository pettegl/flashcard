const fs = require('node:fs');
const path = require('node:path');

// NFR-08: ≥ 90% lines for non-UI modules. Jest fails on a threshold path with no files,
// so each module folder gets its threshold as soon as it exists.
const NON_UI_DIRS = ['platform', 'data', 'state', 'storage', 'audio', 'telemetry'];
const nonUiThresholds = Object.fromEntries(
  NON_UI_DIRS.filter((d) => fs.existsSync(path.join(__dirname, 'src', d))).map((d) => [
    `./src/${d}/`,
    { lines: 90 },
  ]),
);

/** @type {import('jest').Config} */
module.exports = {
  testEnvironment: 'jsdom',
  roots: ['<rootDir>/src', '<rootDir>/tests'],
  testMatch: ['**/tests/{unit,component,integration}/**/*.test.{ts,tsx}'],
  collectCoverageFrom: ['src/**/*.{ts,tsx}', '!src/index.tsx'],
  coverageDirectory: 'coverage',
  // NFR-08: ≥ 80% lines overall.
  coverageThreshold: {
    global: { lines: 80 },
    ...nonUiThresholds,
  },
};
