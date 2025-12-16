// Mock database module before importing anything
jest.mock('../../../src/models/database');
const TradingRequest = require('../../../src/models/TradingRequest');
const database = require('../../../src/models/database');
const { mockGet, mockQuery, mockRun } = require('../../utils/mockHelpers');

describe('TradingRequest Model', () => {
  // beforeEach already handled by setup.js

  describe('create', () => {
    test('should create a trading request with valid data', async () => {
      const mockRequestData = {
        employee_email: 'test@example.com',
        stock_name: 'Apple Inc.',
        ticker: 'AAPL',
        shares: 100,
        share_price: 150.50,
        total_value: 15050.00,
        currency: 'USD',
        trading_type: 'buy'
      };

      const mockUuid = '123e4567-e89b-12d3-a456-426614174000';
      const mockInsertResult = [{ uuid: mockUuid }];

      // Mock database.query to return the inserted row
      mockQuery(mockInsertResult);

      const result = await TradingRequest.create(mockRequestData);

      expect(database.query).toHaveBeenCalledTimes(1);
      expect(database.query).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO trading_requests'),
        expect.arrayContaining([
          mockUuid,
          'test@example.com',
          'Apple Inc.',
          'AAPL',
          100,
          150.50,
          15050.00,
          'USD',
          expect.any(Number),
          expect.any(Number),
          expect.any(Number),
          'buy',
          'pending',
          null,
          expect.any(String)
        ])
      );

      expect(result).toHaveProperty('uuid', mockUuid);
      expect(result.employee_email).toBe('test@example.com');
    });

    test('should handle database errors', async () => {
      const mockRequestData = {
        employee_email: 'test@example.com',
        stock_name: 'Apple Inc.',
        ticker: 'AAPL',
        shares: 100,
        share_price: 150.50,
        total_value: 15050.00,
        currency: 'USD',
        trading_type: 'buy'
      };

      const mockError = new Error('Database connection failed');
      database.query.mockRejectedValueOnce(mockError);

      await expect(TradingRequest.create(mockRequestData)).rejects.toThrow('Database connection failed');
    });
  });

  describe('updateStatus', () => {
    test('should update status and rejection reason', async () => {
      const mockUuid = '123e4567-e89b-12d3-a456-426614174000';
      const mockStatus = 'approved';
      const mockRejectionReason = null;
      const mockRunResult = { changes: 1 };

      mockRun(null, 1);

      const result = await TradingRequest.updateStatus(mockUuid, mockStatus, mockRejectionReason);

      expect(database.run).toHaveBeenCalledTimes(1);
      expect(database.run).toHaveBeenCalledWith(
        expect.stringContaining('UPDATE trading_requests'),
        [mockStatus, mockRejectionReason, mockUuid]
      );
      expect(result).toEqual({ changes: 1 });
    });
  });

  describe('getByUuid', () => {
    test('should find trading request by UUID', async () => {
      const mockUuid = '123e4567-e89b-12d3-a456-426614174000';
      const mockRequest = {
        uuid: mockUuid,
        employee_email: 'test@example.com',
        ticker: 'AAPL',
        status: 'pending'
      };

      // Mock database.get which is used by findOne
      mockGet(mockRequest);

      const result = await TradingRequest.getByUuid(mockUuid);

      expect(database.get).toHaveBeenCalledTimes(1);
      expect(database.get).toHaveBeenCalledWith(
        expect.stringContaining('SELECT * FROM trading_requests'),
        [mockUuid]
      );
      expect(result).toEqual(mockRequest);
    });

    test('should return null when trading request not found', async () => {
      const mockUuid = '123e4567-e89b-12d3-a456-426614174000';
      mockGet(null);

      const result = await TradingRequest.getByUuid(mockUuid);

      expect(result).toBeNull();
    });
  });
});