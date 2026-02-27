// Test setup file
process.env.NODE_ENV = 'test';
process.env.SESSION_SECRET = process.env.SESSION_SECRET || 'test-session-secret-for-jest';
process.env.ADMIN_USERNAME = process.env.ADMIN_USERNAME || 'admin';
process.env.ADMIN_PASSWORD_HASH = process.env.ADMIN_PASSWORD_HASH || '$2a$12$test';

// Mock database module
jest.mock('../src/models/database');

// Mock console methods to reduce noise during tests
global.console = {
  ...console,
  log: jest.fn(),
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn()
};

// Import mock helpers
const { setupDefaultDatabaseMocks, resetDatabaseMocks } = require('./utils/mockHelpers');

// Setup default mocks before all tests
beforeAll(() => {
  setupDefaultDatabaseMocks();
});

// Reset mocks before each test
beforeEach(() => {
  resetDatabaseMocks();
});

// Clear all mocks after each test
afterEach(() => {
  jest.clearAllMocks();
});