/** @type {import('jest').Config} */
const config = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/src', '<rootDir>/tests'],
  testMatch: ['**/*.test.ts'],
  moduleFileExtensions: ['ts', 'js', 'json'],
  // Map our project-local ESM-style relative imports with .js to their TypeScript sources.
  // Use explicit mappings to avoid interfering with node_modules' own relative imports.
  moduleNameMapper: {
    '^\./utils\.js$': '<rootDir>/src/utils.ts',
    '^\./printing\.js$': '<rootDir>/src/printing.ts',
    '^\./walker\.js$': '<rootDir>/src/walker.ts',
    '^\./index\.js$': '<rootDir>/src/index.ts',
  },
  clearMocks: true,
  collectCoverageFrom: ['src/**/*.ts', '!src/**/index.ts'],
  coverageDirectory: 'coverage',
};

module.exports = config;
