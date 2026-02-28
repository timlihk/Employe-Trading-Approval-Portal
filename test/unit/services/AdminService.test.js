// Mock all dependencies before importing anything
jest.mock('../../../src/models/database');
jest.mock('../../../src/models/RestrictedStock');
jest.mock('../../../src/models/RestrictedStockChangelog');
jest.mock('../../../src/models/TradingRequest');
jest.mock('../../../src/models/AuditLog');
jest.mock('../../../src/services/ISINService');
jest.mock('../../../src/utils/logger', () => ({
  logger: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn()
  }
}));
jest.mock('bcryptjs');

const RestrictedStock = require('../../../src/models/RestrictedStock');
const RestrictedStockChangelog = require('../../../src/models/RestrictedStockChangelog');
const TradingRequest = require('../../../src/models/TradingRequest');
const AuditLog = require('../../../src/models/AuditLog');
const bcrypt = require('bcryptjs');
const ISINServiceClass = require('../../../src/services/ISINService');
const { AppError } = require('../../../src/middleware/errorHandler');

// AdminService exports a singleton, so we need to require after mocks
const adminService = require('../../../src/services/AdminService');

describe('AdminService', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    jest.clearAllMocks();
    // Restore env to a clean state for each test
    process.env = { ...originalEnv };
    process.env.ADMIN_USERNAME = 'admin';
    process.env.ADMIN_PASSWORD_HASH = undefined;
    process.env.ADMIN_PASSWORD = undefined;

    // Default mock for ISINService static methods
    ISINServiceClass.detectISIN = jest.fn().mockReturnValue(false);
    ISINServiceClass.instance = {
      validateISIN: jest.fn()
    };
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  // ──────────────────────────────────────────────
  // authenticateAdmin
  // ──────────────────────────────────────────────
  describe('authenticateAdmin', () => {
    test('should return authenticated:false for wrong username', async () => {
      const result = await adminService.authenticateAdmin('wronguser', 'password');
      expect(result).toEqual({ authenticated: false });
    });

    test('should authenticate with bcrypt hash when ADMIN_PASSWORD_HASH is set', async () => {
      process.env.ADMIN_PASSWORD_HASH = '$2a$12$hashedpassword';
      bcrypt.compare.mockResolvedValue(true);

      const result = await adminService.authenticateAdmin('admin', 'correctpassword');

      expect(bcrypt.compare).toHaveBeenCalledWith('correctpassword', '$2a$12$hashedpassword');
      expect(result).toEqual({ username: 'admin', authenticated: true });
    });

    test('should return authenticated:false when bcrypt compare fails', async () => {
      process.env.ADMIN_PASSWORD_HASH = '$2a$12$hashedpassword';
      bcrypt.compare.mockResolvedValue(false);

      const result = await adminService.authenticateAdmin('admin', 'wrongpassword');

      expect(result).toEqual({ authenticated: false });
    });

    test('should fallback to plaintext password when no hash is set', async () => {
      delete process.env.ADMIN_PASSWORD_HASH;
      process.env.ADMIN_PASSWORD = 'plaintext123';

      const result = await adminService.authenticateAdmin('admin', 'plaintext123');

      expect(result).toEqual({ username: 'admin', authenticated: true });
    });

    test('should return authenticated:false when plaintext password does not match', async () => {
      delete process.env.ADMIN_PASSWORD_HASH;
      process.env.ADMIN_PASSWORD = 'plaintext123';

      const result = await adminService.authenticateAdmin('admin', 'wrongpassword');

      expect(result).toEqual({ authenticated: false });
    });

    test('should return authenticated:false when neither hash nor plaintext is configured', async () => {
      delete process.env.ADMIN_PASSWORD_HASH;
      delete process.env.ADMIN_PASSWORD;

      const result = await adminService.authenticateAdmin('admin', 'anything');

      expect(result).toEqual({ authenticated: false });
    });

    test('should throw AppError(500) when bcrypt throws an error', async () => {
      process.env.ADMIN_PASSWORD_HASH = '$2a$12$hashedpassword';
      bcrypt.compare.mockRejectedValue(new Error('bcrypt internal error'));

      await expect(
        adminService.authenticateAdmin('admin', 'password')
      ).rejects.toThrow(AppError);

      await expect(
        adminService.authenticateAdmin('admin', 'password')
      ).rejects.toMatchObject({ statusCode: 500 });
    });

    test('should use custom ADMIN_USERNAME from env', async () => {
      process.env.ADMIN_USERNAME = 'superadmin';
      process.env.ADMIN_PASSWORD = 'secret';

      const resultWrong = await adminService.authenticateAdmin('admin', 'secret');
      expect(resultWrong).toEqual({ authenticated: false });

      const resultCorrect = await adminService.authenticateAdmin('superadmin', 'secret');
      expect(resultCorrect).toEqual({ username: 'superadmin', authenticated: true });
    });
  });

  // ──────────────────────────────────────────────
  // generatePasswordHash
  // ──────────────────────────────────────────────
  describe('generatePasswordHash', () => {
    test('should call bcrypt.hash with 12 salt rounds', async () => {
      bcrypt.hash.mockResolvedValue('$2a$12$hashed');

      const result = await adminService.generatePasswordHash('mypassword');

      expect(bcrypt.hash).toHaveBeenCalledWith('mypassword', 12);
      expect(result).toBe('$2a$12$hashed');
    });
  });

  // ──────────────────────────────────────────────
  // addRestrictedStock
  // ──────────────────────────────────────────────
  describe('addRestrictedStock', () => {
    const adminEmail = 'admin@example.com';
    const ipAddress = '192.168.1.1';

    test('should add a stock successfully (equity ticker)', async () => {
      RestrictedStock.getByTicker.mockResolvedValue(null);
      ISINServiceClass.detectISIN.mockReturnValue(false);

      // Mock getCompanyName (uses global fetch)
      const mockResponse = {
        json: jest.fn().mockResolvedValue({
          chart: {
            result: [{
              meta: {
                currency: 'USD',
                instrumentType: 'EQUITY',
                regularMarketPrice: 150,
                longName: 'Apple Inc.',
                exchangeName: 'NASDAQ'
              }
            }]
          }
        })
      };
      global.fetch = jest.fn().mockResolvedValue(mockResponse);

      RestrictedStock.add.mockResolvedValue({
        uuid: 'stock-uuid-123',
        id: 1,
        ticker: 'AAPL',
        company_name: 'Apple Inc.'
      });
      RestrictedStockChangelog.logChange.mockResolvedValue('changelog-uuid');
      AuditLog.logActivity.mockResolvedValue('audit-uuid');

      const result = await adminService.addRestrictedStock('aapl', adminEmail, ipAddress);

      expect(result).toEqual({
        ticker: 'AAPL',
        company_name: 'Apple Inc.',
        id: 1
      });
      expect(RestrictedStock.getByTicker).toHaveBeenCalledWith('aapl');
      expect(RestrictedStock.add).toHaveBeenCalledWith('AAPL', 'Apple Inc.', null, 'equity', expect.anything());
      expect(RestrictedStockChangelog.logChange).toHaveBeenCalledWith(
        expect.objectContaining({
          ticker: 'AAPL',
          action: 'added',
          admin_email: adminEmail,
          instrument_type: 'equity'
        }),
        expect.anything()
      );
      expect(AuditLog.logActivity).toHaveBeenCalledWith(
        adminEmail,
        'admin',
        'add_restricted_stock',
        'restricted_stock',
        'stock-uuid-123',
        expect.stringContaining('Added AAPL'),
        ipAddress,
        null,
        null,
        expect.anything()
      );
    });

    test('should throw 409 AppError when stock already exists', async () => {
      RestrictedStock.getByTicker.mockResolvedValue({
        ticker: 'AAPL',
        company_name: 'Apple Inc.'
      });

      await expect(
        adminService.addRestrictedStock('AAPL', adminEmail)
      ).rejects.toThrow(AppError);

      await expect(
        adminService.addRestrictedStock('AAPL', adminEmail)
      ).rejects.toMatchObject({ statusCode: 409 });

      expect(RestrictedStock.add).not.toHaveBeenCalled();
    });

    test('should handle ISIN bonds correctly', async () => {
      RestrictedStock.getByTicker.mockResolvedValue(null);
      ISINServiceClass.detectISIN.mockReturnValue(true);
      ISINServiceClass.instance.validateISIN.mockResolvedValue({
        valid: true,
        issuer: 'US Treasury',
        name: 'US Treasury Bond 2025'
      });

      RestrictedStock.add.mockResolvedValue({
        uuid: 'bond-uuid-123',
        id: 2,
        ticker: 'US1234567890',
        company_name: 'US Treasury'
      });
      RestrictedStockChangelog.logChange.mockResolvedValue('changelog-uuid');
      AuditLog.logActivity.mockResolvedValue('audit-uuid');

      const result = await adminService.addRestrictedStock('US1234567890', adminEmail, ipAddress);

      expect(result.ticker).toBe('US1234567890');
      expect(RestrictedStock.add).toHaveBeenCalledWith(
        'US1234567890',
        'US Treasury',
        null,
        'bond',
        expect.anything()
      );
    });

    test('should use fallback company name when external API fails', async () => {
      RestrictedStock.getByTicker.mockResolvedValue(null);
      ISINServiceClass.detectISIN.mockReturnValue(false);

      // Simulate fetch throwing
      global.fetch = jest.fn().mockRejectedValue(new Error('Network error'));

      RestrictedStock.add.mockResolvedValue({
        uuid: 'stock-uuid-456',
        id: 3,
        ticker: 'XYZ',
        company_name: 'Added via Admin Panel'
      });
      RestrictedStockChangelog.logChange.mockResolvedValue('changelog-uuid');
      AuditLog.logActivity.mockResolvedValue('audit-uuid');

      const result = await adminService.addRestrictedStock('XYZ', adminEmail);

      expect(result.company_name).toBe('Added via Admin Panel');
    });

    test('should throw generic AppError(500) for unexpected errors', async () => {
      RestrictedStock.getByTicker.mockRejectedValue(new Error('DB down'));

      await expect(
        adminService.addRestrictedStock('AAPL', adminEmail)
      ).rejects.toThrow(AppError);

      await expect(
        adminService.addRestrictedStock('AAPL', adminEmail)
      ).rejects.toMatchObject({
        statusCode: 500,
        message: 'Unable to add restricted stock'
      });
    });
  });

  // ──────────────────────────────────────────────
  // removeRestrictedStock
  // ──────────────────────────────────────────────
  describe('removeRestrictedStock', () => {
    const adminEmail = 'admin@example.com';
    const ipAddress = '10.0.0.1';

    test('should remove a stock successfully', async () => {
      RestrictedStock.getByTicker.mockResolvedValue({
        uuid: 'stock-uuid-123',
        ticker: 'AAPL',
        company_name: 'Apple Inc.',
        instrument_type: 'equity'
      });
      RestrictedStock.remove.mockResolvedValue({ changes: 1 });
      RestrictedStockChangelog.logChange.mockResolvedValue('changelog-uuid');
      AuditLog.logActivity.mockResolvedValue('audit-uuid');

      const result = await adminService.removeRestrictedStock('AAPL', adminEmail, ipAddress);

      expect(result).toBe(true);
      expect(RestrictedStock.remove).toHaveBeenCalledWith('AAPL', expect.anything());
      expect(RestrictedStockChangelog.logChange).toHaveBeenCalledWith(
        expect.objectContaining({
          ticker: 'AAPL',
          action: 'removed',
          admin_email: adminEmail,
          instrument_type: 'equity'
        }),
        expect.anything()
      );
      expect(AuditLog.logActivity).toHaveBeenCalledWith(
        adminEmail,
        'admin',
        'remove_restricted_stock',
        'restricted_stock',
        'stock-uuid-123',
        expect.stringContaining('Removed AAPL'),
        ipAddress,
        null,
        null,
        expect.anything()
      );
    });

    test('should throw 404 AppError when stock is not in restricted list', async () => {
      RestrictedStock.getByTicker.mockResolvedValue(null);

      await expect(
        adminService.removeRestrictedStock('NOPE', adminEmail)
      ).rejects.toThrow(AppError);

      await expect(
        adminService.removeRestrictedStock('NOPE', adminEmail)
      ).rejects.toMatchObject({ statusCode: 404 });

      expect(RestrictedStock.remove).not.toHaveBeenCalled();
    });

    test('should throw 404 AppError when remove returns 0 changes', async () => {
      RestrictedStock.getByTicker.mockResolvedValue({
        uuid: 'stock-uuid-123',
        ticker: 'AAPL',
        company_name: 'Apple Inc.'
      });
      RestrictedStock.remove.mockResolvedValue({ changes: 0 });

      await expect(
        adminService.removeRestrictedStock('AAPL', adminEmail)
      ).rejects.toThrow(AppError);

      await expect(
        adminService.removeRestrictedStock('AAPL', adminEmail)
      ).rejects.toMatchObject({ statusCode: 404 });
    });

    test('should throw generic AppError(500) for unexpected errors', async () => {
      RestrictedStock.getByTicker.mockRejectedValue(new Error('Connection lost'));

      await expect(
        adminService.removeRestrictedStock('AAPL', adminEmail)
      ).rejects.toThrow(AppError);

      await expect(
        adminService.removeRestrictedStock('AAPL', adminEmail)
      ).rejects.toMatchObject({
        statusCode: 500,
        message: 'Unable to remove restricted stock'
      });
    });

    test('should default instrument_type to equity when not set on existing stock', async () => {
      RestrictedStock.getByTicker.mockResolvedValue({
        uuid: 'stock-uuid-789',
        ticker: 'MSFT',
        company_name: 'Microsoft Corp',
        instrument_type: undefined
      });
      RestrictedStock.remove.mockResolvedValue({ changes: 1 });
      RestrictedStockChangelog.logChange.mockResolvedValue('changelog-uuid');
      AuditLog.logActivity.mockResolvedValue('audit-uuid');

      await adminService.removeRestrictedStock('MSFT', adminEmail);

      expect(RestrictedStockChangelog.logChange).toHaveBeenCalledWith(
        expect.objectContaining({
          instrument_type: 'equity'
        }),
        expect.anything()
      );
    });
  });

  // ──────────────────────────────────────────────
  // approveRequest
  // ──────────────────────────────────────────────
  describe('approveRequest', () => {
    const adminEmail = 'admin@example.com';
    const requestUuid = 'req-uuid-123';
    const ipAddress = '10.0.0.5';

    test('should approve a pending request', async () => {
      TradingRequest.getByUuid.mockResolvedValue({
        uuid: requestUuid,
        status: 'pending',
        trading_type: 'buy',
        shares: 100,
        ticker: 'AAPL',
        employee_email: 'employee@example.com'
      });
      TradingRequest.updateStatus.mockResolvedValue({ changes: 1 });
      AuditLog.logActivity.mockResolvedValue('audit-uuid');

      const result = await adminService.approveRequest(requestUuid, adminEmail, ipAddress);

      expect(result).toBe(true);
      expect(TradingRequest.updateStatus).toHaveBeenCalledWith(requestUuid, 'approved', null, expect.anything());
      expect(AuditLog.logActivity).toHaveBeenCalledWith(
        adminEmail,
        'admin',
        'approve_trading_request',
        'trading_request',
        requestUuid,
        expect.stringContaining('Approved buy request for 100 shares of AAPL'),
        ipAddress,
        null,
        null,
        expect.anything()
      );
    });

    test('should throw 404 AppError when request not found', async () => {
      TradingRequest.getByUuid.mockResolvedValue(null);

      await expect(
        adminService.approveRequest(requestUuid, adminEmail)
      ).rejects.toThrow(AppError);

      await expect(
        adminService.approveRequest(requestUuid, adminEmail)
      ).rejects.toMatchObject({ statusCode: 404 });

      expect(TradingRequest.updateStatus).not.toHaveBeenCalled();
    });

    test('should throw 400 AppError when request is not pending', async () => {
      TradingRequest.getByUuid.mockResolvedValue({
        uuid: requestUuid,
        status: 'approved'
      });

      await expect(
        adminService.approveRequest(requestUuid, adminEmail)
      ).rejects.toThrow(AppError);

      await expect(
        adminService.approveRequest(requestUuid, adminEmail)
      ).rejects.toMatchObject({ statusCode: 400 });
    });

    test('should throw 400 for rejected requests', async () => {
      TradingRequest.getByUuid.mockResolvedValue({
        uuid: requestUuid,
        status: 'rejected'
      });

      await expect(
        adminService.approveRequest(requestUuid, adminEmail)
      ).rejects.toMatchObject({ statusCode: 400 });
    });

    test('should throw generic AppError(500) for unexpected errors', async () => {
      TradingRequest.getByUuid.mockRejectedValue(new Error('Unexpected'));

      await expect(
        adminService.approveRequest(requestUuid, adminEmail)
      ).rejects.toMatchObject({
        statusCode: 500,
        message: 'Unable to approve request'
      });
    });
  });

  // ──────────────────────────────────────────────
  // rejectRequest
  // ──────────────────────────────────────────────
  describe('rejectRequest', () => {
    const adminEmail = 'admin@example.com';
    const requestUuid = 'req-uuid-456';
    const ipAddress = '10.0.0.5';

    test('should reject a pending request with a reason', async () => {
      TradingRequest.getByUuid.mockResolvedValue({
        uuid: requestUuid,
        status: 'pending',
        trading_type: 'sell',
        shares: 50,
        ticker: 'GOOG',
        employee_email: 'employee@example.com',
        escalated: false
      });
      TradingRequest.updateStatus.mockResolvedValue({ changes: 1 });
      AuditLog.logActivity.mockResolvedValue('audit-uuid');

      const reason = 'Compliance violation';
      const result = await adminService.rejectRequest(requestUuid, reason, adminEmail, ipAddress);

      expect(result).toBe(true);
      expect(TradingRequest.updateStatus).toHaveBeenCalledWith(requestUuid, 'rejected', reason, expect.anything());
      expect(AuditLog.logActivity).toHaveBeenCalledWith(
        adminEmail,
        'admin',
        'reject_trading_request',
        'trading_request',
        requestUuid,
        expect.stringContaining('Reason: Compliance violation'),
        ipAddress,
        null,
        null,
        expect.anything()
      );
    });

    test('should use default reason for escalated requests when no reason provided', async () => {
      TradingRequest.getByUuid.mockResolvedValue({
        uuid: requestUuid,
        status: 'pending',
        trading_type: 'buy',
        shares: 100,
        ticker: 'MSFT',
        employee_email: 'employee@example.com',
        escalated: true
      });
      TradingRequest.updateStatus.mockResolvedValue({ changes: 1 });
      AuditLog.logActivity.mockResolvedValue('audit-uuid');

      const result = await adminService.rejectRequest(requestUuid, null, adminEmail);

      expect(result).toBe(true);
      expect(TradingRequest.updateStatus).toHaveBeenCalledWith(
        requestUuid,
        'rejected',
        'Administrative decision - Request rejected after review',
        expect.anything()
      );
    });

    test('should pass null reason for non-escalated requests when no reason provided', async () => {
      TradingRequest.getByUuid.mockResolvedValue({
        uuid: requestUuid,
        status: 'pending',
        trading_type: 'buy',
        shares: 100,
        ticker: 'MSFT',
        employee_email: 'employee@example.com',
        escalated: false
      });
      TradingRequest.updateStatus.mockResolvedValue({ changes: 1 });
      AuditLog.logActivity.mockResolvedValue('audit-uuid');

      await adminService.rejectRequest(requestUuid, null, adminEmail);

      expect(TradingRequest.updateStatus).toHaveBeenCalledWith(
        requestUuid,
        'rejected',
        null,
        expect.anything()
      );
    });

    test('should throw 404 AppError when request not found', async () => {
      TradingRequest.getByUuid.mockResolvedValue(null);

      await expect(
        adminService.rejectRequest(requestUuid, 'reason', adminEmail)
      ).rejects.toMatchObject({ statusCode: 404 });

      expect(TradingRequest.updateStatus).not.toHaveBeenCalled();
    });

    test('should throw 400 AppError when request is not pending', async () => {
      TradingRequest.getByUuid.mockResolvedValue({
        uuid: requestUuid,
        status: 'approved'
      });

      await expect(
        adminService.rejectRequest(requestUuid, 'reason', adminEmail)
      ).rejects.toMatchObject({ statusCode: 400 });
    });

    test('should throw generic AppError(500) for unexpected errors', async () => {
      TradingRequest.getByUuid.mockRejectedValue(new Error('DB error'));

      await expect(
        adminService.rejectRequest(requestUuid, 'reason', adminEmail)
      ).rejects.toMatchObject({
        statusCode: 500,
        message: 'Unable to reject request'
      });
    });
  });

  // ──────────────────────────────────────────────
  // getCompanyName
  // ──────────────────────────────────────────────
  describe('getCompanyName', () => {
    test('should return company long name from Yahoo Finance API', async () => {
      const mockResponse = {
        json: jest.fn().mockResolvedValue({
          chart: {
            result: [{
              meta: {
                currency: 'USD',
                instrumentType: 'EQUITY',
                regularMarketPrice: 150.25,
                longName: 'Apple Inc.',
                shortName: 'Apple',
                exchangeName: 'NASDAQ'
              }
            }]
          }
        })
      };
      global.fetch = jest.fn().mockResolvedValue(mockResponse);

      const result = await adminService.getCompanyName('AAPL');

      expect(result).toBe('Apple Inc.');
      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining('AAPL'),
        expect.objectContaining({ signal: expect.any(AbortSignal) })
      );
    });

    test('should return shortName when longName is not available', async () => {
      const mockResponse = {
        json: jest.fn().mockResolvedValue({
          chart: {
            result: [{
              meta: {
                currency: 'USD',
                instrumentType: 'EQUITY',
                regularMarketPrice: 100,
                longName: null,
                shortName: 'Short Co',
                exchangeName: 'NYSE'
              }
            }]
          }
        })
      };
      global.fetch = jest.fn().mockResolvedValue(mockResponse);

      const result = await adminService.getCompanyName('SHORT');
      expect(result).toBe('Short Co');
    });

    test('should return null for invalid tickers (no equity type)', async () => {
      const mockResponse = {
        json: jest.fn().mockResolvedValue({
          chart: {
            result: [{
              meta: {
                currency: null,
                instrumentType: 'MUTUALFUND',
                regularMarketPrice: 0,
                longName: null,
                shortName: null,
                exchangeName: 'YHD'
              }
            }]
          }
        })
      };
      global.fetch = jest.fn().mockResolvedValue(mockResponse);

      const result = await adminService.getCompanyName('INVALID');
      expect(result).toBeNull();
    });

    test('should return null when API returns no chart result', async () => {
      const mockResponse = {
        json: jest.fn().mockResolvedValue({
          chart: { result: null }
        })
      };
      global.fetch = jest.fn().mockResolvedValue(mockResponse);

      const result = await adminService.getCompanyName('NOPE');
      expect(result).toBeNull();
    });

    test('should return null when fetch throws (network error)', async () => {
      global.fetch = jest.fn().mockRejectedValue(new Error('fetch failed'));

      const result = await adminService.getCompanyName('ERR');
      expect(result).toBeNull();
    });

    test('should return null when ticker has YHD exchange (placeholder)', async () => {
      const mockResponse = {
        json: jest.fn().mockResolvedValue({
          chart: {
            result: [{
              meta: {
                currency: 'USD',
                instrumentType: 'EQUITY',
                regularMarketPrice: 50,
                longName: 'Fake Corp',
                exchangeName: 'YHD'
              }
            }]
          }
        })
      };
      global.fetch = jest.fn().mockResolvedValue(mockResponse);

      const result = await adminService.getCompanyName('FAKE');
      expect(result).toBeNull();
    });
  });
});
