const { metrics } = require('../../utils/metrics');

// Mock class that mimics the real Database class
class MockDatabase {
  constructor() {
    this.pool = null;
    this.query = jest.fn().mockImplementation(async (sql, params) => {
      console.log('[mock] database.query called with:', { sql, params });
      return [];
    });
    this.run = jest.fn().mockResolvedValue({ uuid: null, changes: 0 });
    this.get = jest.fn().mockResolvedValue(null);
    this.getPool = jest.fn().mockReturnValue(null);
    this.poolStats = jest.fn().mockReturnValue({ total: 0, idle: 0, waiting: 0 });
    this.close = jest.fn().mockResolvedValue();
    this.init = jest.fn().mockResolvedValue();
  }
}

const mockDatabase = new MockDatabase();

module.exports = mockDatabase;