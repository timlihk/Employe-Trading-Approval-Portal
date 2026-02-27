const { handleValidationErrors } = require('../../../src/middleware/validation');

// Mock express-validator's validationResult
jest.mock('express-validator', () => ({
  body: jest.fn().mockReturnValue({
    trim: jest.fn().mockReturnThis(),
    isLength: jest.fn().mockReturnThis(),
    matches: jest.fn().mockReturnThis(),
    withMessage: jest.fn().mockReturnThis(),
    customSanitizer: jest.fn().mockReturnThis(),
    isInt: jest.fn().mockReturnThis(),
    isIn: jest.fn().mockReturnThis(),
    isEmail: jest.fn().mockReturnThis(),
    normalizeEmail: jest.fn().mockReturnThis()
  }),
  param: jest.fn().mockReturnValue({
    isInt: jest.fn().mockReturnThis(),
    withMessage: jest.fn().mockReturnThis()
  }),
  query: jest.fn().mockReturnValue({
    optional: jest.fn().mockReturnThis(),
    isDate: jest.fn().mockReturnThis(),
    withMessage: jest.fn().mockReturnThis(),
    custom: jest.fn().mockReturnThis()
  }),
  validationResult: jest.fn()
}));

// Mock the logger
jest.mock('../../../src/utils/logger', () => ({
  logger: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn()
  },
  logSecurityEvent: jest.fn()
}));

const { validationResult } = require('express-validator');
const { logSecurityEvent } = require('../../../src/utils/logger');

/**
 * Create a mock Express request object
 */
function createMockReq(overrides = {}) {
  return {
    path: '/api/test',
    body: {},
    params: {},
    query: {},
    ...overrides
  };
}

/**
 * Create a mock Express response object
 */
function createMockRes() {
  const res = {
    statusCode: 200,
    _json: null,
    _redirectUrl: null
  };
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockImplementation((data) => {
    res._json = data;
    return res;
  });
  res.redirect = jest.fn().mockImplementation((url) => {
    res._redirectUrl = url;
    return res;
  });
  return res;
}

describe('validation middleware', () => {
  describe('handleValidationErrors', () => {
    afterEach(() => {
      jest.clearAllMocks();
    });

    test('should call next() when there are no validation errors', () => {
      validationResult.mockReturnValue({
        isEmpty: () => true,
        array: () => []
      });

      const req = createMockReq();
      const res = createMockRes();
      const next = jest.fn();

      handleValidationErrors(req, res, next);

      expect(next).toHaveBeenCalledTimes(1);
      expect(next).toHaveBeenCalledWith();
      expect(res.status).not.toHaveBeenCalled();
      expect(res.redirect).not.toHaveBeenCalled();
    });

    test('should log security event on validation failure', () => {
      const errors = [{ path: 'field', msg: 'Invalid', value: 'bad' }];
      validationResult.mockReturnValue({
        isEmpty: () => false,
        array: () => errors
      });

      const req = createMockReq({ body: { field: 'bad' } });
      const res = createMockRes();
      const next = jest.fn();

      handleValidationErrors(req, res, next);

      expect(logSecurityEvent).toHaveBeenCalledWith(
        'VALIDATION_FAILED',
        expect.objectContaining({
          errors,
          body: req.body
        }),
        req
      );
    });

    describe('API requests (default path)', () => {
      test('should return 400 JSON response with error details', () => {
        const errors = [
          { path: 'email', msg: 'Invalid email', value: 'not-an-email' },
          { path: 'name', msg: 'Name is required', value: '' }
        ];
        validationResult.mockReturnValue({
          isEmpty: () => false,
          array: () => errors
        });

        const req = createMockReq({ path: '/api/something' });
        const res = createMockRes();
        const next = jest.fn();

        handleValidationErrors(req, res, next);

        expect(next).not.toHaveBeenCalled();
        expect(res.status).toHaveBeenCalledWith(400);
        expect(res.json).toHaveBeenCalledWith({
          error: 'Validation failed',
          details: [
            { field: 'email', message: 'Invalid email', value: 'not-an-email' },
            { field: 'name', message: 'Name is required', value: '' }
          ]
        });
      });

      test('should map error fields correctly in JSON response', () => {
        const errors = [
          { path: 'ticker', msg: 'Invalid ticker format', value: '!!!' }
        ];
        validationResult.mockReturnValue({
          isEmpty: () => false,
          array: () => errors
        });

        const req = createMockReq({ path: '/api/data' });
        const res = createMockRes();
        const next = jest.fn();

        handleValidationErrors(req, res, next);

        expect(res._json.details[0]).toEqual({
          field: 'ticker',
          message: 'Invalid ticker format',
          value: '!!!'
        });
      });
    });

    describe('preview-trade and submit-trade paths', () => {
      test('should redirect to employee-dashboard for /preview-trade with ticker error', () => {
        const errors = [{ path: 'ticker', msg: 'Invalid ticker format', value: '!!BAD!!' }];
        validationResult.mockReturnValue({
          isEmpty: () => false,
          array: () => errors
        });

        const req = createMockReq({
          path: '/preview-trade',
          body: { ticker: '!!BAD!!', shares: '100', trading_type: 'buy' }
        });
        const res = createMockRes();
        const next = jest.fn();

        handleValidationErrors(req, res, next);

        expect(res.redirect).toHaveBeenCalledTimes(1);
        const redirectUrl = res._redirectUrl;
        expect(redirectUrl).toContain('/employee-dashboard');
        expect(redirectUrl).toContain('error=');
        expect(redirectUrl).toContain('ticker=');
        expect(redirectUrl).toContain('shares=100');
        expect(redirectUrl).toContain('trading_type=buy');
      });

      test('should redirect with shares error message for /submit-trade', () => {
        const errors = [{ path: 'shares', msg: 'Shares must be between 1 and 1,000,000', value: '0' }];
        validationResult.mockReturnValue({
          isEmpty: () => false,
          array: () => errors
        });

        const req = createMockReq({
          path: '/submit-trade',
          body: { ticker: 'AAPL', shares: '0', trading_type: 'buy' }
        });
        const res = createMockRes();
        const next = jest.fn();

        handleValidationErrors(req, res, next);

        const redirectUrl = res._redirectUrl;
        expect(redirectUrl).toContain('/employee-dashboard');
        // URLSearchParams encodes spaces as +
        expect(redirectUrl).toContain('Invalid+number+of+shares');
      });

      test('should redirect with trading_type error message', () => {
        const errors = [{ path: 'trading_type', msg: 'Trading type must be buy or sell', value: 'hold' }];
        validationResult.mockReturnValue({
          isEmpty: () => false,
          array: () => errors
        });

        const req = createMockReq({
          path: '/preview-trade',
          body: { ticker: 'AAPL', shares: '100', trading_type: 'hold' }
        });
        const res = createMockRes();
        const next = jest.fn();

        handleValidationErrors(req, res, next);

        const redirectUrl = res._redirectUrl;
        // URLSearchParams encodes spaces as +
        expect(redirectUrl).toContain('Invalid+trading+type');
      });

      test('should redirect with generic error for unknown field errors', () => {
        const errors = [{ path: 'unknown_field', msg: 'Something is wrong' }];
        validationResult.mockReturnValue({
          isEmpty: () => false,
          array: () => errors
        });

        const req = createMockReq({
          path: '/preview-trade',
          body: { ticker: '', shares: '', trading_type: 'buy' }
        });
        const res = createMockRes();
        const next = jest.fn();

        handleValidationErrors(req, res, next);

        const redirectUrl = res._redirectUrl;
        expect(redirectUrl).toContain('/employee-dashboard');
        expect(redirectUrl).toContain('error=');
      });

      test('should preserve form data in redirect query params', () => {
        const errors = [{ path: 'ticker', msg: 'Invalid', value: 'X' }];
        validationResult.mockReturnValue({
          isEmpty: () => false,
          array: () => errors
        });

        const req = createMockReq({
          path: '/preview-trade',
          body: { ticker: 'X', shares: '50', trading_type: 'sell' }
        });
        const res = createMockRes();
        const next = jest.fn();

        handleValidationErrors(req, res, next);

        const redirectUrl = res._redirectUrl;
        expect(redirectUrl).toContain('ticker=X');
        expect(redirectUrl).toContain('shares=50');
        expect(redirectUrl).toContain('trading_type=sell');
      });

      test('should use default values when body fields are missing', () => {
        const errors = [{ path: 'ticker', msg: 'Required' }];
        validationResult.mockReturnValue({
          isEmpty: () => false,
          array: () => errors
        });

        const req = createMockReq({
          path: '/preview-trade',
          body: {}
        });
        const res = createMockRes();
        const next = jest.fn();

        handleValidationErrors(req, res, next);

        const redirectUrl = res._redirectUrl;
        expect(redirectUrl).toContain('trading_type=buy');
      });
    });

    describe('escalation path', () => {
      test('should redirect to employee-history for escalation_reason errors', () => {
        const errors = [{ path: 'escalation_reason', msg: 'Too short' }];
        validationResult.mockReturnValue({
          isEmpty: () => false,
          array: () => errors
        });

        const req = createMockReq({
          path: '/submit-escalation/123'
        });
        const res = createMockRes();
        const next = jest.fn();

        handleValidationErrors(req, res, next);

        const redirectUrl = res._redirectUrl;
        expect(redirectUrl).toContain('/employee-history');
        expect(redirectUrl).toContain('error=');
        expect(decodeURIComponent(redirectUrl)).toContain('Escalation reason must be between');
      });

      test('should redirect with generic error for non-escalation_reason fields', () => {
        const errors = [{ path: 'other_field', msg: 'Bad value' }];
        validationResult.mockReturnValue({
          isEmpty: () => false,
          array: () => errors
        });

        const req = createMockReq({
          path: '/submit-escalation/456'
        });
        const res = createMockRes();
        const next = jest.fn();

        handleValidationErrors(req, res, next);

        const redirectUrl = res._redirectUrl;
        expect(redirectUrl).toContain('/employee-history');
        expect(redirectUrl).toContain('error=');
      });
    });

    describe('admin authentication path', () => {
      test('should redirect to /admin for username validation errors', () => {
        const errors = [{ path: 'username', msg: 'Invalid characters' }];
        validationResult.mockReturnValue({
          isEmpty: () => false,
          array: () => errors
        });

        const req = createMockReq({
          path: '/admin-authenticate'
        });
        const res = createMockRes();
        const next = jest.fn();

        handleValidationErrors(req, res, next);

        const redirectUrl = res._redirectUrl;
        expect(redirectUrl).toContain('/admin');
        expect(decodeURIComponent(redirectUrl)).toContain('Invalid username format');
      });

      test('should redirect with generic credentials error for password errors', () => {
        const errors = [{ path: 'password', msg: 'Password is required' }];
        validationResult.mockReturnValue({
          isEmpty: () => false,
          array: () => errors
        });

        const req = createMockReq({
          path: '/admin-authenticate'
        });
        const res = createMockRes();
        const next = jest.fn();

        handleValidationErrors(req, res, next);

        const redirectUrl = res._redirectUrl;
        expect(redirectUrl).toContain('/admin');
        expect(decodeURIComponent(redirectUrl)).toContain('Invalid credentials');
      });
    });
  });
});
