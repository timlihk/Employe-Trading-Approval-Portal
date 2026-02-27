module.exports = {
  testEnvironment: 'node',
  testMatch: [
    '**/test/**/*.test.js',
    '**/test/**/*.spec.js'
  ],
  collectCoverageFrom: [
    'src/**/*.js',
    '!src/app.js',
    '!src/controllers/**',
    '!src/models/database.js',
    '!src/routes/**'
  ],
  coverageThreshold: {
    global: {
      branches: 45,
      functions: 50,
      lines: 48,
      statements: 48
    }
  },
  setupFilesAfterEnv: ['<rootDir>/test/setup.js'],
  testTimeout: 10000
};