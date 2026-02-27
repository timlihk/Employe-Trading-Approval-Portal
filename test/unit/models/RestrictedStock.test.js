// Mock database module before importing anything
jest.mock('../../../src/models/database');
const RestrictedStock = require('../../../src/models/RestrictedStock');
const database = require('../../../src/models/database');
const { mockGet, mockQuery, mockRun, mockQueryError } = require('../../utils/mockHelpers');

// Mock uuid to return predictable values
jest.mock('uuid', () => ({
  v4: jest.fn(() => 'mock-uuid-1234')
}));

describe('RestrictedStock Model', () => {
  describe('tableName', () => {
    test('should return restricted_stocks', () => {
      expect(RestrictedStock.tableName).toBe('restricted_stocks');
    });
  });

  describe('getAll', () => {
    test('should return all restricted stocks ordered by ticker', async () => {
      database.getPool.mockReturnValueOnce({});
      const mockStocks = [
        { uuid: 'uuid-1', ticker: 'AAPL', company_name: 'Apple Inc.' },
        { uuid: 'uuid-2', ticker: 'MSFT', company_name: 'Microsoft Corp.' }
      ];
      mockQuery(mockStocks);

      const result = await RestrictedStock.getAll();

      expect(database.query).toHaveBeenCalledWith(
        expect.stringContaining('SELECT * FROM restricted_stocks'),
        []
      );
      expect(database.query).toHaveBeenCalledWith(
        expect.stringContaining('ORDER BY ticker'),
        []
      );
      expect(result).toEqual(mockStocks);
    });

    test('should return empty array when no restricted stocks exist', async () => {
      database.getPool.mockReturnValueOnce({});
      mockQuery([]);

      const result = await RestrictedStock.getAll();
      expect(result).toEqual([]);
    });
  });

  describe('isRestricted', () => {
    test('should return true when ticker is restricted', async () => {
      // exists() calls count() which calls get()
      database.getPool.mockReturnValueOnce({});
      mockGet({ count: 1 });

      const result = await RestrictedStock.isRestricted('AAPL');
      expect(result).toBe(true);
    });

    test('should return false when ticker is not restricted', async () => {
      database.getPool.mockReturnValueOnce({});
      mockGet({ count: 0 });

      const result = await RestrictedStock.isRestricted('ZZZZ');
      expect(result).toBe(false);
    });

    test('should convert ticker to uppercase', async () => {
      database.getPool.mockReturnValueOnce({});
      mockGet({ count: 1 });

      await RestrictedStock.isRestricted('aapl');

      expect(database.get).toHaveBeenCalledWith(
        expect.stringContaining('WHERE ticker = $1'),
        ['AAPL']
      );
    });
  });

  describe('getByTicker', () => {
    test('should return restricted stock by ticker', async () => {
      database.getPool.mockReturnValueOnce({});
      const mockStock = { uuid: 'uuid-1', ticker: 'AAPL', company_name: 'Apple Inc.' };
      mockGet(mockStock);

      const result = await RestrictedStock.getByTicker('AAPL');

      expect(database.get).toHaveBeenCalledWith(
        expect.stringContaining('WHERE ticker = $1'),
        ['AAPL']
      );
      expect(result).toEqual(mockStock);
    });

    test('should return null when ticker not found', async () => {
      database.getPool.mockReturnValueOnce({});
      mockGet(null);

      const result = await RestrictedStock.getByTicker('ZZZZ');
      expect(result).toBeNull();
    });

    test('should convert ticker to uppercase for lookup', async () => {
      database.getPool.mockReturnValueOnce({});
      mockGet(null);

      await RestrictedStock.getByTicker('msft');

      expect(database.get).toHaveBeenCalledWith(
        expect.any(String),
        ['MSFT']
      );
    });
  });

  describe('add', () => {
    test('should add a new restricted stock with all parameters', async () => {
      database.getPool.mockReturnValueOnce({});
      mockQuery([{ uuid: 'mock-uuid-1234' }]);

      const result = await RestrictedStock.add('AAPL', 'Apple Inc.', 'NASDAQ', 'equity');

      expect(database.query).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO restricted_stocks'),
        ['mock-uuid-1234', 'AAPL', 'Apple Inc.', 'NASDAQ', 'equity']
      );
      expect(result).toEqual({
        uuid: 'mock-uuid-1234',
        ticker: 'AAPL',
        company_name: 'Apple Inc.',
        exchange: 'NASDAQ',
        instrument_type: 'equity'
      });
    });

    test('should use default values for exchange and instrument_type', async () => {
      database.getPool.mockReturnValueOnce({});
      mockQuery([{ uuid: 'mock-uuid-1234' }]);

      const result = await RestrictedStock.add('MSFT', 'Microsoft Corp.');

      expect(database.query).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO restricted_stocks'),
        ['mock-uuid-1234', 'MSFT', 'Microsoft Corp.', null, 'equity']
      );
      expect(result.exchange).toBeNull();
      expect(result.instrument_type).toBe('equity');
    });

    test('should convert ticker to uppercase on insert', async () => {
      database.getPool.mockReturnValueOnce({});
      mockQuery([{ uuid: 'mock-uuid-1234' }]);

      const result = await RestrictedStock.add('goog', 'Alphabet Inc.');

      expect(database.query).toHaveBeenCalledWith(
        expect.any(String),
        expect.arrayContaining(['GOOG'])
      );
      expect(result.ticker).toBe('GOOG');
    });

    test('should handle database errors', async () => {
      database.getPool.mockReturnValueOnce({});
      database.query.mockRejectedValueOnce(new Error('Duplicate ticker'));

      await expect(
        RestrictedStock.add('AAPL', 'Apple Inc.')
      ).rejects.toThrow('Duplicate ticker');
    });

    test('should fallback to generated uuid when query returns empty', async () => {
      database.getPool.mockReturnValueOnce({});
      mockQuery([]);

      const result = await RestrictedStock.add('TSLA', 'Tesla Inc.');

      // insertedRow is undefined, so it falls back to the generated uuid
      expect(result.uuid).toBe('mock-uuid-1234');
    });
  });

  describe('remove', () => {
    test('should remove a restricted stock by ticker', async () => {
      database.getPool.mockReturnValueOnce({});
      mockRun(null, 1);

      const result = await RestrictedStock.remove('AAPL');

      expect(database.run).toHaveBeenCalledWith(
        expect.stringContaining('DELETE FROM restricted_stocks'),
        ['AAPL']
      );
      expect(result).toEqual({ changes: 1 });
    });

    test('should convert ticker to uppercase when removing', async () => {
      database.getPool.mockReturnValueOnce({});
      mockRun(null, 1);

      await RestrictedStock.remove('aapl');

      expect(database.run).toHaveBeenCalledWith(
        expect.any(String),
        ['AAPL']
      );
    });

    test('should return zero changes when ticker does not exist', async () => {
      database.getPool.mockReturnValueOnce({});
      mockRun(null, 0);

      const result = await RestrictedStock.remove('ZZZZ');
      expect(result).toEqual({ changes: 0 });
    });
  });

  describe('getCount', () => {
    test('should return the total count of restricted stocks', async () => {
      database.getPool.mockReturnValueOnce({});
      mockGet({ count: 15 });

      const result = await RestrictedStock.getCount();

      expect(database.get).toHaveBeenCalledWith(
        'SELECT COUNT(*) as count FROM restricted_stocks',
        []
      );
      expect(result).toBe(15);
    });

    test('should return zero when no restricted stocks exist', async () => {
      database.getPool.mockReturnValueOnce({});
      mockGet({ count: 0 });

      const result = await RestrictedStock.getCount();
      expect(result).toBe(0);
    });

    test('should propagate database errors', async () => {
      database.getPool.mockReturnValueOnce({});
      database.get.mockRejectedValueOnce(new Error('Connection timeout'));

      await expect(RestrictedStock.getCount()).rejects.toThrow('Connection timeout');
    });
  });
});
