const database = require('../../src/models/database');

/**
 * Reset all database mocks
 */
function resetDatabaseMocks() {
  database.query.mockClear();
  database.run.mockClear();
  database.get.mockClear();
  database.getPool.mockClear();
  database.poolStats.mockClear();
  database.close.mockClear();
  database.init.mockClear();
}

/**
 * Setup default mock responses for database queries
 */
function setupDefaultDatabaseMocks() {
  // Default mock responses
  database.query.mockResolvedValue([]);
  database.run.mockResolvedValue({ uuid: null, changes: 0 });
  database.get.mockResolvedValue(null);
  database.getPool.mockReturnValue(null);
}

/**
 * Mock a successful database query with specific rows
 * @param {Array} rows - Rows to return
 */
function mockQuery(rows) {
  database.query.mockResolvedValueOnce(rows);
}

/**
 * Mock a database query that throws an error
 * @param {Error} error - Error to throw
 */
function mockQueryError(error) {
  database.query.mockRejectedValueOnce(error);
}

/**
 * Mock a successful database get with a specific row
 * @param {Object} row - Row to return
 */
function mockGet(row) {
  database.get.mockResolvedValueOnce(row);
}

/**
 * Mock a database get that returns null
 */
function mockGetNull() {
  database.get.mockResolvedValueOnce(null);
}

/**
 * Mock a successful database run with UUID and changes
 * @param {string} uuid - UUID to return
 * @param {number} changes - Number of changes
 */
function mockRun(uuid = null, changes = 0) {
  database.run.mockResolvedValueOnce({ uuid, changes });
}

module.exports = {
  resetDatabaseMocks,
  setupDefaultDatabaseMocks,
  mockQuery,
  mockQueryError,
  mockGet,
  mockGetNull,
  mockRun
};