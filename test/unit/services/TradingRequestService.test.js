// Mock all dependencies before importing anything
jest.mock('../../../src/models/database');
jest.mock('../../../src/models/TradingRequest');
jest.mock('../../../src/models/RestrictedStock');
jest.mock('../../../src/models/AuditLog');
jest.mock('../../../src/services/CurrencyService');
jest.mock('../../../src/services/ISINService', () => {
  const mockValidateISIN = jest.fn();
  const MockISINService = jest.fn().mockImplementation(() => ({
    validateISIN: mockValidateISIN
  }));
  MockISINService.detectISIN = jest.fn().mockReturnValue(false);
  MockISINService.isValidISINFormat = jest.fn();
  MockISINService.__mockValidateISIN = mockValidateISIN;
  return MockISINService;
});
jest.mock('../../../src/services/MockDataService');
jest.mock('../../../src/utils/logger', () => ({
  logger: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn()
  }
}));
jest.mock('../../../src/utils/simpleCache', () => {
  const mockCache = {
    get: jest.fn().mockReturnValue(null),
    set: jest.fn(),
    getStats: jest.fn().mockReturnValue({}),
    keyToEntry: new Map()
  };
  return {
    SimpleCache: jest.fn(() => mockCache),
    __mockCache: mockCache
  };
});
jest.mock('../../../src/utils/retryBreaker', () => {
  const mockCircuitBreaker = {
    getState: jest.fn().mockReturnValue('CLOSED'),
    getStats: jest.fn().mockReturnValue({})
  };
  return {
    CircuitBreaker: jest.fn(() => mockCircuitBreaker),
    callWithResilience: jest.fn(),
    __mockCircuitBreaker: mockCircuitBreaker
  };
});

const TradingRequest = require('../../../src/models/TradingRequest');
const RestrictedStock = require('../../../src/models/RestrictedStock');
const AuditLog = require('../../../src/models/AuditLog');
const CurrencyService = require('../../../src/services/CurrencyService');
const ISINServiceClass = require('../../../src/services/ISINService');
const MockDataService = require('../../../src/services/MockDataService');
const database = require('../../../src/models/database');
const { callWithResilience } = require('../../../src/utils/retryBreaker');
const { AppError } = require('../../../src/middleware/errorHandler');

// TradingRequestService exports a singleton instance
const tradingRequestService = require('../../../src/services/TradingRequestService');

describe('TradingRequestService', () => {
  beforeEach(() => {
    jest.clearAllMocks();

    // Default: database pool is available
    database.getPool.mockReturnValue({});

    // Default: ISINService static methods
    ISINServiceClass.detectISIN = jest.fn().mockReturnValue(false);

    // Default: CurrencyService
    CurrencyService.convertToUSD = jest.fn().mockResolvedValue({
      usdAmount: 150,
      exchangeRate: 1
    });
  });

  // ──────────────────────────────────────────────
  // checkRestrictedStatus
  // ──────────────────────────────────────────────
  describe('checkRestrictedStatus', () => {
    test('should return restricted status from database when pool is available', async () => {
      database.getPool.mockReturnValue({});
      RestrictedStock.isRestricted.mockResolvedValue(true);

      const result = await tradingRequestService.checkRestrictedStatus('AAPL');

      expect(RestrictedStock.isRestricted).toHaveBeenCalledWith('AAPL');
      expect(result).toBe(true);
    });

    test('should return false when stock is not restricted', async () => {
      database.getPool.mockReturnValue({});
      RestrictedStock.isRestricted.mockResolvedValue(false);

      const result = await tradingRequestService.checkRestrictedStatus('GOOG');
      expect(result).toBe(false);
    });

    test('should use MockDataService when no database pool is available', async () => {
      database.getPool.mockReturnValue(null);
      MockDataService.checkRestrictedStatus.mockResolvedValue(true);

      const result = await tradingRequestService.checkRestrictedStatus('AAPL');

      expect(MockDataService.checkRestrictedStatus).toHaveBeenCalledWith('AAPL');
      expect(RestrictedStock.isRestricted).not.toHaveBeenCalled();
      expect(result).toBe(true);
    });

    test('should return false when database query throws an error', async () => {
      database.getPool.mockReturnValue({});
      RestrictedStock.isRestricted.mockRejectedValue(new Error('DB error'));

      const result = await tradingRequestService.checkRestrictedStatus('AAPL');
      expect(result).toBe(false);
    });
  });

  // ──────────────────────────────────────────────
  // validateTickerOrISIN
  // ──────────────────────────────────────────────
  describe('validateTickerOrISIN', () => {
    test('should validate an ISIN as a bond when detectISIN returns true', async () => {
      ISINServiceClass.detectISIN.mockReturnValue(true);
      ISINServiceClass.__mockValidateISIN.mockResolvedValue({
        valid: true,
        name: 'US Treasury Bond',
        currency: 'USD',
        issuer: 'US Treasury',
        exchange: 'OTC'
      });

      const result = await tradingRequestService.validateTickerOrISIN('US1234567890');

      expect(ISINServiceClass.detectISIN).toHaveBeenCalledWith('US1234567890');
      expect(result.isValid).toBe(true);
      expect(result.instrument_type).toBe('bond');
      expect(result.ticker).toBe('US1234567890');
    });

    test('should return invalid when ISIN validation fails', async () => {
      ISINServiceClass.detectISIN.mockReturnValue(true);
      ISINServiceClass.__mockValidateISIN.mockResolvedValue({
        valid: false,
        error: 'Invalid ISIN checksum'
      });

      const result = await tradingRequestService.validateTickerOrISIN('XX0000000000');

      expect(result.isValid).toBe(false);
      expect(result.instrument_type).toBe('bond');
      expect(result.error).toBe('Invalid ISIN checksum');
    });

    test('should validate regular ticker when detectISIN returns false', async () => {
      ISINServiceClass.detectISIN.mockReturnValue(false);

      // Mock validateTicker via callWithResilience
      callWithResilience.mockResolvedValue({
        isValid: true,
        symbol: 'AAPL',
        currency: 'USD',
        exchangeName: 'NASDAQ',
        longName: 'Apple Inc.',
        regularMarketPrice: 150,
        instrument_type: 'equity'
      });

      const result = await tradingRequestService.validateTickerOrISIN('AAPL');

      expect(result.isValid).toBe(true);
      expect(result.instrument_type).toBe('equity');
      expect(result.ticker).toBe('AAPL');
    });

    test('should return error result when ticker validation fails', async () => {
      ISINServiceClass.detectISIN.mockReturnValue(false);

      callWithResilience.mockResolvedValue({
        isValid: false,
        error: 'Ticker not found'
      });

      const result = await tradingRequestService.validateTickerOrISIN('XYZXYZ');

      expect(result.isValid).toBe(false);
      expect(result.instrument_type).toBe('equity');
    });

    test('should handle errors gracefully and return isValid false', async () => {
      ISINServiceClass.detectISIN.mockImplementation(() => {
        throw new Error('Unexpected crash');
      });

      const result = await tradingRequestService.validateTickerOrISIN('AAPL');

      expect(result.isValid).toBe(false);
      expect(result.error).toBe('Unable to validate ticker/ISIN at this time');
    });

    test('should trim and uppercase input', async () => {
      ISINServiceClass.detectISIN.mockReturnValue(false);
      callWithResilience.mockResolvedValue({
        isValid: true,
        symbol: 'AAPL',
        currency: 'USD',
        longName: 'Apple Inc.',
        regularMarketPrice: 150
      });

      await tradingRequestService.validateTickerOrISIN('  aapl  ');

      expect(ISINServiceClass.detectISIN).toHaveBeenCalledWith('AAPL');
    });
  });

  // ──────────────────────────────────────────────
  // _validateAndFetchTicker (private, but important)
  // ──────────────────────────────────────────────
  describe('_validateAndFetchTicker', () => {
    test('should throw AppError(400) when ticker is invalid', async () => {
      ISINServiceClass.detectISIN.mockReturnValue(false);
      callWithResilience.mockResolvedValue({
        isValid: false,
        error: 'Ticker not found'
      });

      await expect(
        tradingRequestService._validateAndFetchTicker('INVALID')
      ).rejects.toThrow(AppError);

      await expect(
        tradingRequestService._validateAndFetchTicker('INVALID')
      ).rejects.toMatchObject({ statusCode: 400 });
    });

    test('should return validation data when ticker is valid', async () => {
      ISINServiceClass.detectISIN.mockReturnValue(false);
      callWithResilience.mockResolvedValue({
        isValid: true,
        symbol: 'AAPL',
        currency: 'USD',
        longName: 'Apple Inc.',
        regularMarketPrice: 150
      });

      const result = await tradingRequestService._validateAndFetchTicker('AAPL');
      expect(result.isValid).toBe(true);
    });
  });

  // ──────────────────────────────────────────────
  // _calculateEstimatedValues (private helper)
  // ──────────────────────────────────────────────
  describe('_calculateEstimatedValues', () => {
    test('should calculate estimated values for equity', () => {
      const validation = {
        instrument_type: 'equity',
        regularMarketPrice: 150,
        longName: 'Apple Inc.',
        currency: 'USD'
      };

      const result = tradingRequestService._calculateEstimatedValues(validation, 100);

      expect(result.instrumentType).toBe('equity');
      expect(result.sharePrice).toBe(150);
      expect(result.estimatedValue).toBe(15000);
      expect(result.instrumentName).toBe('Apple Inc.');
      expect(result.currency).toBe('USD');
    });

    test('should use price of 1 for bonds', () => {
      const validation = {
        instrument_type: 'bond',
        name: 'US Treasury Bond',
        currency: 'USD'
      };

      const result = tradingRequestService._calculateEstimatedValues(validation, 1000);

      expect(result.instrumentType).toBe('bond');
      expect(result.sharePrice).toBe(1);
      expect(result.estimatedValue).toBe(1000);
    });

    test('should default to 100 when no price data is available for equity', () => {
      const validation = {
        instrument_type: 'equity',
        longName: 'Mystery Corp',
        currency: 'EUR'
      };

      const result = tradingRequestService._calculateEstimatedValues(validation, 10);

      expect(result.sharePrice).toBe(100);
      expect(result.estimatedValue).toBe(1000);
    });

    test('should fallback instrument name when longName and name are missing', () => {
      const validation = {
        instrument_type: 'equity',
        regularMarketPrice: 50,
        currency: 'USD',
        ticker: 'XYZ'
      };

      const result = tradingRequestService._calculateEstimatedValues(validation, 10);

      expect(result.instrumentName).toBe('equity XYZ');
    });
  });

  // ──────────────────────────────────────────────
  // _convertToUSDIfNeeded (private helper)
  // ──────────────────────────────────────────────
  describe('_convertToUSDIfNeeded', () => {
    test('should return original amount and rate 1 for USD currency', async () => {
      const result = await tradingRequestService._convertToUSDIfNeeded(150, 'USD', 100);

      expect(result.usdAmount).toBe(150);
      expect(result.totalValueUSD).toBe(15000);
      expect(result.exchangeRate).toBe(1);
      expect(CurrencyService.convertToUSD).not.toHaveBeenCalled();
    });

    test('should convert non-USD currencies using CurrencyService', async () => {
      CurrencyService.convertToUSD.mockResolvedValue({
        usdAmount: 20,
        exchangeRate: 0.13
      });

      const result = await tradingRequestService._convertToUSDIfNeeded(150, 'HKD', 100);

      expect(CurrencyService.convertToUSD).toHaveBeenCalledWith(150, 'HKD');
      expect(result.usdAmount).toBe(20);
      expect(result.totalValueUSD).toBe(2000);
      expect(result.exchangeRate).toBe(0.13);
    });
  });

  // ──────────────────────────────────────────────
  // _determineInitialStatus (private helper)
  // ──────────────────────────────────────────────
  describe('_determineInitialStatus', () => {
    test('should return rejected status for restricted stocks', () => {
      const result = tradingRequestService._determineInitialStatus(
        true, 'AAPL', 'equity', 'buy', []
      );

      expect(result.initialStatus).toBe('rejected');
      expect(result.rejectionReason).toContain('restricted trading list');
      expect(result.autoEscalate).toBe(false);
    });

    test('should include bond-specific language for restricted bonds', () => {
      const result = tradingRequestService._determineInitialStatus(
        true, 'US1234567890', 'bond', 'buy', []
      );

      expect(result.rejectionReason).toContain('bond');
    });

    test('should return approved status for non-restricted stocks with no short-term trades', () => {
      const result = tradingRequestService._determineInitialStatus(
        false, 'AAPL', 'equity', 'buy', []
      );

      expect(result.initialStatus).toBe('approved');
      expect(result.rejectionReason).toBeNull();
      expect(result.autoEscalate).toBe(false);
    });

    test('should return pending with autoEscalate for short-term trades', () => {
      const shortTermTrades = [{
        trading_type: 'sell',
        shares: 100,
        created_at: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString() // 5 days ago
      }];

      const result = tradingRequestService._determineInitialStatus(
        false, 'AAPL', 'equity', 'buy', shortTermTrades
      );

      expect(result.initialStatus).toBe('pending');
      expect(result.rejectionReason).toBeNull();
      expect(result.autoEscalate).toBe(true);
      expect(result.escalationReason).toContain('Short-term trading detected');
      expect(result.escalationReason).toContain('sold');
    });
  });

  // ──────────────────────────────────────────────
  // getEmployeeRequests
  // ──────────────────────────────────────────────
  describe('getEmployeeRequests', () => {
    test('should fetch filtered history for an employee', async () => {
      const mockData = {
        data: [{ uuid: 'req-1', ticker: 'AAPL' }],
        pagination: { total: 1, page: 1, limit: 25, pages: 1 }
      };
      TradingRequest.getFilteredHistory.mockResolvedValue(mockData);

      const result = await tradingRequestService.getEmployeeRequests('employee@example.com', { status: 'approved' });

      expect(TradingRequest.getFilteredHistory).toHaveBeenCalledWith(
        { employee_email: 'employee@example.com', status: 'approved' },
        'created_at',
        'DESC'
      );
      expect(result).toEqual(mockData);
    });

    test('should pass custom sort options', async () => {
      TradingRequest.getFilteredHistory.mockResolvedValue({ data: [], pagination: {} });

      await tradingRequestService.getEmployeeRequests('a@b.com', {}, 'ticker', 'ASC');

      expect(TradingRequest.getFilteredHistory).toHaveBeenCalledWith(
        { employee_email: 'a@b.com' },
        'ticker',
        'ASC'
      );
    });

    test('should throw AppError(500) when getFilteredHistory fails', async () => {
      TradingRequest.getFilteredHistory.mockRejectedValue(new Error('DB error'));

      await expect(
        tradingRequestService.getEmployeeRequests('a@b.com')
      ).rejects.toThrow(AppError);

      await expect(
        tradingRequestService.getEmployeeRequests('a@b.com')
      ).rejects.toMatchObject({
        statusCode: 500,
        message: 'Unable to fetch trading requests'
      });
    });
  });

  // ──────────────────────────────────────────────
  // escalateRequest
  // ──────────────────────────────────────────────
  describe('escalateRequest', () => {
    const requestUuid = 'esc-uuid-001';
    const employeeEmail = 'employee@example.com';
    const ipAddress = '10.0.0.1';
    const reason = 'Need to sell for personal emergency';

    test('should escalate a rejected request belonging to the employee', async () => {
      TradingRequest.getByUuid.mockResolvedValue({
        uuid: requestUuid,
        status: 'rejected',
        employee_email: 'employee@example.com',
        escalated: false
      });
      TradingRequest.escalate.mockResolvedValue({ changes: 1 });
      AuditLog.logActivity.mockResolvedValue('audit-uuid');

      const result = await tradingRequestService.escalateRequest(
        requestUuid, reason, employeeEmail, ipAddress
      );

      expect(result).toBe(true);
      expect(TradingRequest.escalate).toHaveBeenCalledWith(requestUuid, reason);
      expect(AuditLog.logActivity).toHaveBeenCalledWith(
        employeeEmail,
        'employee',
        'escalate_trading_request',
        'trading_request',
        requestUuid,
        expect.stringContaining(reason),
        ipAddress
      );
    });

    test('should escalate a pending request', async () => {
      TradingRequest.getByUuid.mockResolvedValue({
        uuid: requestUuid,
        status: 'pending',
        employee_email: 'employee@example.com',
        escalated: false
      });
      TradingRequest.escalate.mockResolvedValue({ changes: 1 });
      AuditLog.logActivity.mockResolvedValue('audit-uuid');

      const result = await tradingRequestService.escalateRequest(
        requestUuid, reason, employeeEmail
      );

      expect(result).toBe(true);
    });

    test('should throw 404 when request not found', async () => {
      TradingRequest.getByUuid.mockResolvedValue(null);

      await expect(
        tradingRequestService.escalateRequest(requestUuid, reason, employeeEmail)
      ).rejects.toMatchObject({ statusCode: 404 });
    });

    test('should throw 403 when employee does not own the request', async () => {
      TradingRequest.getByUuid.mockResolvedValue({
        uuid: requestUuid,
        status: 'rejected',
        employee_email: 'other@example.com',
        escalated: false
      });

      await expect(
        tradingRequestService.escalateRequest(requestUuid, reason, employeeEmail)
      ).rejects.toMatchObject({ statusCode: 403 });
    });

    test('should throw 400 when request status is approved', async () => {
      TradingRequest.getByUuid.mockResolvedValue({
        uuid: requestUuid,
        status: 'approved',
        employee_email: 'employee@example.com',
        escalated: false
      });

      await expect(
        tradingRequestService.escalateRequest(requestUuid, reason, employeeEmail)
      ).rejects.toMatchObject({ statusCode: 400 });
    });

    test('should throw 400 when request is already escalated', async () => {
      TradingRequest.getByUuid.mockResolvedValue({
        uuid: requestUuid,
        status: 'rejected',
        employee_email: 'employee@example.com',
        escalated: true
      });

      await expect(
        tradingRequestService.escalateRequest(requestUuid, reason, employeeEmail)
      ).rejects.toMatchObject({ statusCode: 400 });
    });

    test('should throw generic AppError(500) for unexpected errors', async () => {
      TradingRequest.getByUuid.mockRejectedValue(new Error('Connection lost'));

      await expect(
        tradingRequestService.escalateRequest(requestUuid, reason, employeeEmail)
      ).rejects.toMatchObject({
        statusCode: 500,
        message: 'Unable to escalate request'
      });
    });
  });

  // ──────────────────────────────────────────────
  // createTradingRequest
  // ──────────────────────────────────────────────
  describe('createTradingRequest', () => {
    const employeeEmail = 'employee@example.com';
    const ipAddress = '192.168.1.1';

    beforeEach(() => {
      // Mock the validateTickerOrISIN flow:
      // detectISIN false -> validateTicker via callWithResilience
      ISINServiceClass.detectISIN.mockReturnValue(false);
      callWithResilience.mockResolvedValue({
        isValid: true,
        symbol: 'AAPL',
        currency: 'USD',
        exchangeName: 'NASDAQ',
        longName: 'Apple Inc.',
        regularMarketPrice: 150,
        instrument_type: 'equity'
      });

      RestrictedStock.isRestricted.mockResolvedValue(false);
      TradingRequest.findRecentOppositeTradesByEmployee.mockResolvedValue([]);
      TradingRequest.create.mockResolvedValue({
        uuid: 'new-req-uuid',
        employee_email: 'employee@example.com',
        ticker: 'AAPL',
        shares: 100,
        status: 'approved'
      });
      AuditLog.logActivity.mockResolvedValue('audit-uuid');
    });

    test('should create an approved trading request for non-restricted equity', async () => {
      const requestData = { ticker: 'AAPL', shares: 100, trading_type: 'buy' };

      const result = await tradingRequestService.createTradingRequest(
        requestData, employeeEmail, ipAddress
      );

      expect(result.request.uuid).toBe('new-req-uuid');
      expect(result.isRestricted).toBe(false);
      expect(result.autoProcessed).toBe(true);
      expect(result.instrumentType).toBe('equity');
      expect(TradingRequest.create).toHaveBeenCalledWith(
        expect.objectContaining({
          employee_email: 'employee@example.com',
          ticker: 'AAPL',
          shares: 100,
          trading_type: 'buy',
          status: 'approved',
          instrument_type: 'equity'
        })
      );
    });

    test('should create a rejected request for restricted stock', async () => {
      RestrictedStock.isRestricted.mockResolvedValue(true);
      TradingRequest.create.mockResolvedValue({
        uuid: 'rejected-req-uuid',
        status: 'rejected'
      });

      const requestData = { ticker: 'RESTRICTED', shares: 50, trading_type: 'buy' };
      const result = await tradingRequestService.createTradingRequest(requestData, employeeEmail);

      expect(result.isRestricted).toBe(true);
      expect(TradingRequest.create).toHaveBeenCalledWith(
        expect.objectContaining({
          status: 'rejected',
          rejection_reason: expect.stringContaining('restricted trading list')
        })
      );
    });

    test('should auto-escalate when short-term trading is detected', async () => {
      TradingRequest.findRecentOppositeTradesByEmployee.mockResolvedValue([{
        uuid: 'old-trade-uuid',
        trading_type: 'sell',
        shares: 50,
        status: 'approved',
        created_at: new Date(Date.now() - 10 * 24 * 60 * 60 * 1000).toISOString()
      }]);

      TradingRequest.create.mockResolvedValue({
        uuid: 'escalated-req-uuid',
        status: 'pending',
        escalated: false
      });
      TradingRequest.escalate.mockResolvedValue({ changes: 1 });
      TradingRequest.autoApprove.mockResolvedValue([{ uuid: 'escalated-req-uuid' }]);

      const requestData = { ticker: 'AAPL', shares: 100, trading_type: 'buy' };
      const result = await tradingRequestService.createTradingRequest(requestData, employeeEmail);

      expect(TradingRequest.escalate).toHaveBeenCalledWith(
        'escalated-req-uuid',
        expect.stringContaining('Short-term trading detected')
      );
    });

    test('should use MockDataService when no database pool is available', async () => {
      database.getPool.mockReturnValue(null);
      MockDataService.checkRestrictedStatus.mockResolvedValue(false);
      MockDataService.createTradingRequest.mockResolvedValue({
        uuid: 'mock-uuid',
        status: 'approved'
      });

      const requestData = { ticker: 'AAPL', shares: 10, trading_type: 'buy' };
      const result = await tradingRequestService.createTradingRequest(requestData, employeeEmail);

      expect(MockDataService.createTradingRequest).toHaveBeenCalled();
      expect(TradingRequest.create).not.toHaveBeenCalled();
    });

    test('should throw AppError(400) when ticker validation fails', async () => {
      callWithResilience.mockResolvedValue({
        isValid: false,
        error: 'Ticker not found'
      });

      const requestData = { ticker: 'INVALID', shares: 100, trading_type: 'buy' };

      await expect(
        tradingRequestService.createTradingRequest(requestData, employeeEmail)
      ).rejects.toThrow(AppError);

      await expect(
        tradingRequestService.createTradingRequest(requestData, employeeEmail)
      ).rejects.toMatchObject({ statusCode: 400 });
    });

    test('should throw generic AppError(500) for unexpected errors during creation', async () => {
      TradingRequest.create.mockRejectedValue(new Error('Insert failed'));

      const requestData = { ticker: 'AAPL', shares: 100, trading_type: 'buy' };

      await expect(
        tradingRequestService.createTradingRequest(requestData, employeeEmail)
      ).rejects.toMatchObject({
        statusCode: 500,
        message: 'Unable to create trading request'
      });
    });

    test('should handle currency conversion for non-USD stocks', async () => {
      callWithResilience.mockResolvedValue({
        isValid: true,
        symbol: 'TYO',
        currency: 'JPY',
        exchangeName: 'Tokyo',
        longName: 'Tokyo Corp',
        regularMarketPrice: 5000,
        instrument_type: 'equity'
      });

      CurrencyService.convertToUSD.mockResolvedValue({
        usdAmount: 33.33,
        exchangeRate: 0.00667
      });

      TradingRequest.create.mockResolvedValue({
        uuid: 'jpy-req-uuid',
        status: 'approved'
      });

      const requestData = { ticker: 'TYO', shares: 100, trading_type: 'buy' };
      await tradingRequestService.createTradingRequest(requestData, employeeEmail);

      expect(CurrencyService.convertToUSD).toHaveBeenCalledWith(5000, 'JPY');
      expect(TradingRequest.create).toHaveBeenCalledWith(
        expect.objectContaining({
          currency: 'JPY',
          exchange_rate: 0.00667
        })
      );
    });

    test('should gracefully handle short-term trade check errors', async () => {
      TradingRequest.findRecentOppositeTradesByEmployee.mockRejectedValue(
        new Error('Query timeout')
      );

      TradingRequest.create.mockResolvedValue({
        uuid: 'ok-req-uuid',
        status: 'approved'
      });

      const requestData = { ticker: 'AAPL', shares: 10, trading_type: 'buy' };
      const result = await tradingRequestService.createTradingRequest(requestData, employeeEmail);

      // Should still succeed - short-term check failure is non-fatal
      expect(result.request.uuid).toBe('ok-req-uuid');
    });
  });

  // ──────────────────────────────────────────────
  // validateTicker
  // ──────────────────────────────────────────────
  describe('validateTicker', () => {
    test('should return cached result if available', async () => {
      const { __mockCache } = require('../../../src/utils/simpleCache');
      const cachedResult = { isValid: true, symbol: 'AAPL' };
      __mockCache.get.mockReturnValueOnce(cachedResult);

      const result = await tradingRequestService.validateTicker('AAPL');

      expect(result).toBe(cachedResult);
      expect(callWithResilience).not.toHaveBeenCalled();
    });

    test('should call external API via callWithResilience and cache the result', async () => {
      const { __mockCache } = require('../../../src/utils/simpleCache');
      __mockCache.get.mockReturnValue(null);

      const apiResult = {
        isValid: true,
        symbol: 'GOOG',
        currency: 'USD',
        longName: 'Alphabet Inc.'
      };
      callWithResilience.mockResolvedValue(apiResult);

      const result = await tradingRequestService.validateTicker('GOOG');

      expect(callWithResilience).toHaveBeenCalled();
      expect(__mockCache.set).toHaveBeenCalledWith('ticker:GOOG', apiResult);
      expect(result).toEqual(apiResult);
    });

    test('should return error result when circuit breaker is open', async () => {
      const { __mockCache } = require('../../../src/utils/simpleCache');
      __mockCache.get.mockReturnValue(null);
      __mockCache.keyToEntry = new Map(); // no stale cache

      callWithResilience.mockRejectedValue(new Error('Circuit breaker is OPEN'));

      const result = await tradingRequestService.validateTicker('AAPL');

      expect(result.isValid).toBe(false);
      expect(result.error).toContain('temporarily unavailable');
    });

    test('should return error result on AbortError (timeout)', async () => {
      const { __mockCache } = require('../../../src/utils/simpleCache');
      __mockCache.get.mockReturnValue(null);
      __mockCache.keyToEntry = new Map();

      const abortError = new Error('The operation was aborted');
      abortError.name = 'AbortError';
      callWithResilience.mockRejectedValue(abortError);

      const result = await tradingRequestService.validateTicker('AAPL');

      expect(result.isValid).toBe(false);
      expect(result.error).toContain('timed out');
    });

    test('should return stale cache when API fails and stale entry exists', async () => {
      const { __mockCache } = require('../../../src/utils/simpleCache');
      __mockCache.get.mockReturnValue(null);

      const staleResult = { isValid: true, symbol: 'AAPL' };
      __mockCache.keyToEntry = new Map([
        ['ticker:AAPL', { value: staleResult }]
      ]);

      callWithResilience.mockRejectedValue(new Error('API down'));

      const result = await tradingRequestService.validateTicker('AAPL');

      expect(result).toBe(staleResult);
    });

    test('should return generic network error for unknown failures', async () => {
      const { __mockCache } = require('../../../src/utils/simpleCache');
      __mockCache.get.mockReturnValue(null);
      __mockCache.keyToEntry = new Map();

      callWithResilience.mockRejectedValue(new Error('Unknown failure'));

      const result = await tradingRequestService.validateTicker('AAPL');

      expect(result.isValid).toBe(false);
      expect(result.error).toContain('network issues');
    });
  });

  // ──────────────────────────────────────────────
  // getTickerValidationStats
  // ──────────────────────────────────────────────
  describe('getTickerValidationStats', () => {
    test('should return cache and circuit breaker stats', () => {
      const stats = tradingRequestService.getTickerValidationStats();

      expect(stats).toHaveProperty('cache');
      expect(stats).toHaveProperty('circuitBreaker');
    });
  });
});
