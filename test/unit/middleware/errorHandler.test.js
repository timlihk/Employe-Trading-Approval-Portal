const { AppError, catchAsync, handleNotFound, globalErrorHandler } = require('../../../src/middleware/errorHandler');

// Mock the logger module
jest.mock('../../../src/utils/logger', () => ({
  logger: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn()
  },
  logSecurityEvent: jest.fn()
}));

// Mock the metrics module
jest.mock('../../../src/utils/metrics', () => ({
  metrics: { errors: 0, errorCategories: { validation: 0, authentication: 0, database: 0, externalApi: 0, notFound: 0, rateLimit: 0, unknown: 0 }, recentErrors: [] },
  trackError: jest.fn(),
  categorizeError: jest.fn().mockReturnValue('unknown')
}));

/**
 * Create a mock Express request object
 */
function createMockReq(overrides = {}) {
  return {
    id: 'test-request-id',
    originalUrl: '/test-url',
    method: 'GET',
    ip: '127.0.0.1',
    accepts: jest.fn().mockReturnValue(false),
    get: jest.fn().mockReturnValue('test-agent'),
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
    _body: null,
    _json: null,
    _redirectUrl: null
  };
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockImplementation((data) => {
    res._json = data;
    return res;
  });
  res.send = jest.fn().mockImplementation((body) => {
    res._body = body;
    return res;
  });
  res.redirect = jest.fn().mockImplementation((url) => {
    res._redirectUrl = url;
    return res;
  });
  return res;
}

describe('errorHandler middleware', () => {
  describe('AppError', () => {
    test('should create an error with message and status code', () => {
      const error = new AppError('Not found', 404);

      expect(error).toBeInstanceOf(Error);
      expect(error).toBeInstanceOf(AppError);
      expect(error.message).toBe('Not found');
      expect(error.statusCode).toBe(404);
      expect(error.status).toBe('fail');
      expect(error.isOperational).toBe(true);
    });

    test('should set status to "fail" for 4xx errors', () => {
      expect(new AppError('Bad request', 400).status).toBe('fail');
      expect(new AppError('Unauthorized', 401).status).toBe('fail');
      expect(new AppError('Forbidden', 403).status).toBe('fail');
      expect(new AppError('Not found', 404).status).toBe('fail');
      expect(new AppError('Conflict', 409).status).toBe('fail');
      expect(new AppError('Unprocessable', 422).status).toBe('fail');
    });

    test('should set status to "error" for 5xx errors', () => {
      expect(new AppError('Server error', 500).status).toBe('error');
      expect(new AppError('Bad gateway', 502).status).toBe('error');
      expect(new AppError('Service unavailable', 503).status).toBe('error');
    });

    test('should default isOperational to true', () => {
      const error = new AppError('Operational error', 400);
      expect(error.isOperational).toBe(true);
    });

    test('should allow setting isOperational to false for programming errors', () => {
      const error = new AppError('Programming error', 500, false);
      expect(error.isOperational).toBe(false);
    });

    test('should capture a stack trace', () => {
      const error = new AppError('Test error', 500);
      expect(error.stack).toBeDefined();
      expect(error.stack).toContain('Test error');
    });

    test('should be throwable and catchable', () => {
      expect(() => {
        throw new AppError('Test throw', 400);
      }).toThrow('Test throw');
    });
  });

  describe('catchAsync', () => {
    test('should return a function', () => {
      const wrapped = catchAsync(async () => {});
      expect(typeof wrapped).toBe('function');
    });

    test('should call the wrapped async function with req, res, next', async () => {
      const asyncFn = jest.fn().mockResolvedValue(undefined);
      const wrapped = catchAsync(asyncFn);
      const req = createMockReq();
      const res = createMockRes();
      const next = jest.fn();

      await wrapped(req, res, next);

      expect(asyncFn).toHaveBeenCalledWith(req, res, next);
    });

    test('should call next with the error when the async function rejects', async () => {
      const error = new Error('Async failure');
      const asyncFn = jest.fn().mockRejectedValue(error);
      const wrapped = catchAsync(asyncFn);
      const req = createMockReq();
      const res = createMockRes();
      const next = jest.fn();

      await wrapped(req, res, next);

      expect(next).toHaveBeenCalledWith(error);
    });

    test('should not call next when async function resolves successfully', async () => {
      const asyncFn = jest.fn().mockResolvedValue('result');
      const wrapped = catchAsync(asyncFn);
      const req = createMockReq();
      const res = createMockRes();
      const next = jest.fn();

      await wrapped(req, res, next);

      expect(next).not.toHaveBeenCalled();
    });

    test('should propagate AppError through next', async () => {
      const appError = new AppError('Custom error', 422);
      const asyncFn = jest.fn().mockRejectedValue(appError);
      const wrapped = catchAsync(asyncFn);
      const req = createMockReq();
      const res = createMockRes();
      const next = jest.fn();

      await wrapped(req, res, next);

      expect(next).toHaveBeenCalledWith(appError);
      expect(next.mock.calls[0][0].statusCode).toBe(422);
    });
  });

  describe('handleNotFound', () => {
    test('should call next with a 404 AppError', () => {
      const req = createMockReq({ originalUrl: '/nonexistent' });
      const res = createMockRes();
      const next = jest.fn();

      handleNotFound(req, res, next);

      expect(next).toHaveBeenCalledTimes(1);
      const error = next.mock.calls[0][0];
      expect(error).toBeInstanceOf(AppError);
      expect(error.statusCode).toBe(404);
      expect(error.message).toContain('/nonexistent');
    });

    test('should include the original URL in the error message', () => {
      const req = createMockReq({ originalUrl: '/api/v1/missing-resource' });
      const res = createMockRes();
      const next = jest.fn();

      handleNotFound(req, res, next);

      const error = next.mock.calls[0][0];
      expect(error.message).toBe("Can't find /api/v1/missing-resource on this server!");
    });

    test('should set status to "fail" for 404 errors', () => {
      const req = createMockReq();
      const res = createMockRes();
      const next = jest.fn();

      handleNotFound(req, res, next);

      const error = next.mock.calls[0][0];
      expect(error.status).toBe('fail');
    });
  });

  describe('globalErrorHandler', () => {
    const originalNodeEnv = process.env.NODE_ENV;

    afterEach(() => {
      process.env.NODE_ENV = originalNodeEnv;
    });

    test('should default statusCode to 500 if not set', () => {
      process.env.NODE_ENV = 'development';
      const err = new Error('Plain error');
      const req = createMockReq({ accepts: jest.fn().mockReturnValue(false) });
      const res = createMockRes();
      const next = jest.fn();

      globalErrorHandler(err, req, res, next);

      expect(res.status).toHaveBeenCalledWith(500);
    });

    test('should default status to "error" if not set', () => {
      process.env.NODE_ENV = 'development';
      const err = new Error('Plain error');
      const req = createMockReq({ accepts: jest.fn().mockReturnValue(false) });
      const res = createMockRes();
      const next = jest.fn();

      globalErrorHandler(err, req, res, next);

      expect(err.status).toBe('error');
    });

    test('should preserve statusCode if already set on error', () => {
      process.env.NODE_ENV = 'development';
      const err = new AppError('Not found', 404);
      const req = createMockReq({ accepts: jest.fn().mockReturnValue(false) });
      const res = createMockRes();
      const next = jest.fn();

      globalErrorHandler(err, req, res, next);

      expect(res.status).toHaveBeenCalledWith(404);
    });

    describe('development mode', () => {
      beforeEach(() => {
        process.env.NODE_ENV = 'development';
      });

      test('should return JSON response when client accepts JSON but not HTML', () => {
        const err = new AppError('Dev error', 400);
        const req = createMockReq({
          accepts: jest.fn((type) => type === 'json')
        });
        const res = createMockRes();
        const next = jest.fn();

        globalErrorHandler(err, req, res, next);

        expect(res.status).toHaveBeenCalledWith(400);
        expect(res.json).toHaveBeenCalledWith(
          expect.objectContaining({
            status: 'fail',
            message: 'Dev error',
            stack: expect.any(String)
          })
        );
      });

      test('should return HTML response for web requests', () => {
        const err = new AppError('Dev HTML error', 500);
        const req = createMockReq({
          accepts: jest.fn().mockReturnValue(false)
        });
        const res = createMockRes();
        const next = jest.fn();

        globalErrorHandler(err, req, res, next);

        expect(res.status).toHaveBeenCalledWith(500);
        expect(res.send).toHaveBeenCalled();
        const html = res._body;
        expect(html).toContain('Dev HTML error');
        expect(html).toContain('Development Error');
        expect(html).toContain('test-request-id');
      });
    });

    describe('production mode', () => {
      beforeEach(() => {
        process.env.NODE_ENV = 'production';
      });

      test('should send operational error message to client as JSON', () => {
        const err = new AppError('User-facing error', 400);
        const req = createMockReq({
          accepts: jest.fn((type) => type === 'json')
        });
        const res = createMockRes();
        const next = jest.fn();

        globalErrorHandler(err, req, res, next);

        expect(res.status).toHaveBeenCalledWith(400);
        expect(res.json).toHaveBeenCalledWith({
          status: 'fail',
          message: 'User-facing error'
        });
      });

      test('should send operational error as HTML for web requests', () => {
        const err = new AppError('User-facing HTML error', 403);
        const req = createMockReq({
          accepts: jest.fn().mockReturnValue(false)
        });
        const res = createMockRes();
        const next = jest.fn();

        globalErrorHandler(err, req, res, next);

        expect(res.status).toHaveBeenCalledWith(403);
        expect(res.send).toHaveBeenCalled();
        const html = res._body;
        expect(html).toContain('User-facing HTML error');
        expect(html).toContain('test-request-id');
      });

      test('should hide non-operational error details in JSON response', () => {
        const err = new AppError('Internal bug', 500, false);
        const req = createMockReq({
          accepts: jest.fn((type) => type === 'json')
        });
        const res = createMockRes();
        const next = jest.fn();

        globalErrorHandler(err, req, res, next);

        expect(res.status).toHaveBeenCalledWith(500);
        expect(res.json).toHaveBeenCalledWith({
          status: 'error',
          message: 'Something went wrong! Please try again later.'
        });
      });

      test('should hide non-operational error details in HTML response', () => {
        const err = new AppError('Secret bug details', 500, false);
        const req = createMockReq({
          accepts: jest.fn().mockReturnValue(false)
        });
        const res = createMockRes();
        const next = jest.fn();

        globalErrorHandler(err, req, res, next);

        expect(res.status).toHaveBeenCalledWith(500);
        expect(res.send).toHaveBeenCalled();
        const html = res._body;
        expect(html).not.toContain('Secret bug details');
        expect(html).toContain('Something went wrong');
        expect(html).toContain('Internal Server Error');
      });

      test('should treat plain Error objects as non-operational', () => {
        const err = new Error('Unexpected crash');
        const req = createMockReq({
          accepts: jest.fn((type) => type === 'json')
        });
        const res = createMockRes();
        const next = jest.fn();

        globalErrorHandler(err, req, res, next);

        expect(res.status).toHaveBeenCalledWith(500);
        expect(res.json).toHaveBeenCalledWith({
          status: 'error',
          message: 'Something went wrong! Please try again later.'
        });
      });
    });
  });
});
