const { metrics, createMetrics, trackError, categorizeError } = require('../../src/utils/metrics');

describe('Metrics', () => {
  test('should have correct initial structure', () => {
    expect(metrics).toHaveProperty('startTime');
    expect(metrics).toHaveProperty('requests', 0);
    expect(metrics).toHaveProperty('errors', 0);
    expect(metrics).toHaveProperty('latencyBuckets');
    expect(metrics.latencyBuckets).toHaveProperty('under50ms', 0);
    expect(metrics.latencyBuckets).toHaveProperty('under200ms', 0);
    expect(metrics.latencyBuckets).toHaveProperty('under1000ms', 0);
    expect(metrics.latencyBuckets).toHaveProperty('over1000ms', 0);
    expect(metrics).toHaveProperty('externalApis');
    expect(metrics.externalApis).toHaveProperty('tickerValidation');
    expect(metrics.externalApis).toHaveProperty('currencyExchange');
    expect(metrics).toHaveProperty('sessionStore');
    expect(metrics).toHaveProperty('database');
    expect(metrics.database).toHaveProperty('queryCount', 0);
    expect(metrics.database).toHaveProperty('errorCount', 0);
    expect(metrics.database).toHaveProperty('slowQueryCount', 0);
    expect(metrics.database).toHaveProperty('connectionErrors', 0);
    expect(metrics.database).toHaveProperty('connectionStatus', 'unknown');
  });

  test('should have errorCategories structure', () => {
    expect(metrics).toHaveProperty('errorCategories');
    expect(metrics.errorCategories).toEqual({
      validation: 0,
      authentication: 0,
      database: 0,
      externalApi: 0,
      notFound: 0,
      rateLimit: 0,
      unknown: 0
    });
  });

  test('should have recentErrors array', () => {
    expect(metrics).toHaveProperty('recentErrors');
    expect(Array.isArray(metrics.recentErrors)).toBe(true);
  });

  test('createMetrics creates new metrics object', () => {
    const newMetrics = createMetrics();
    expect(newMetrics).not.toBe(metrics); // Different instance
    expect(newMetrics.startTime).toBeGreaterThan(0);
    expect(newMetrics.database.queryCount).toBe(0);
    expect(newMetrics.errorCategories.unknown).toBe(0);
  });

  describe('categorizeError', () => {
    test('should categorize 404 as notFound', () => {
      expect(categorizeError({ statusCode: 404, message: '' })).toBe('notFound');
    });

    test('should categorize 429 as rateLimit', () => {
      expect(categorizeError({ statusCode: 429, message: '' })).toBe('rateLimit');
    });

    test('should categorize 401 as authentication', () => {
      expect(categorizeError({ statusCode: 401, message: '' })).toBe('authentication');
    });

    test('should categorize 403 as authentication', () => {
      expect(categorizeError({ statusCode: 403, message: '' })).toBe('authentication');
    });

    test('should categorize 400 as validation', () => {
      expect(categorizeError({ statusCode: 400, message: '' })).toBe('validation');
    });

    test('should categorize 422 as validation', () => {
      expect(categorizeError({ statusCode: 422, message: '' })).toBe('validation');
    });

    test('should categorize database errors by message', () => {
      expect(categorizeError({ statusCode: 500, message: 'database connection failed' })).toBe('database');
      expect(categorizeError({ statusCode: 500, message: 'pool exhausted' })).toBe('database');
      expect(categorizeError({ statusCode: 500, message: 'ECONNREFUSED' })).toBe('database');
    });

    test('should categorize external API errors by message', () => {
      expect(categorizeError({ statusCode: 500, message: 'Graph API failed' })).toBe('externalApi');
      expect(categorizeError({ statusCode: 500, message: 'SharePoint upload error' })).toBe('externalApi');
      expect(categorizeError({ statusCode: 500, message: 'fetch failed ENOTFOUND' })).toBe('externalApi');
    });

    test('should categorize unknown errors', () => {
      expect(categorizeError({ statusCode: 500, message: 'something broke' })).toBe('unknown');
    });

    test('should handle missing message', () => {
      expect(categorizeError({ statusCode: 500 })).toBe('unknown');
    });
  });

  describe('trackError', () => {
    beforeEach(() => {
      // Reset error tracking state
      Object.keys(metrics.errorCategories).forEach(k => { metrics.errorCategories[k] = 0; });
      metrics.recentErrors.length = 0;
    });

    test('should increment the correct error category', () => {
      trackError({ statusCode: 404, message: 'Not found' }, '/test');
      expect(metrics.errorCategories.notFound).toBe(1);
    });

    test('should add to recentErrors', () => {
      trackError({ statusCode: 400, message: 'Bad request' }, '/api/test');
      expect(metrics.recentErrors).toHaveLength(1);
      expect(metrics.recentErrors[0]).toEqual({
        timestamp: expect.any(String),
        category: 'validation',
        statusCode: 400,
        message: 'Bad request',
        path: '/api/test'
      });
    });

    test('should cap recentErrors at 50 entries', () => {
      for (let i = 0; i < 60; i++) {
        trackError({ statusCode: 500, message: `Error ${i}` });
      }
      expect(metrics.recentErrors).toHaveLength(50);
      expect(metrics.recentErrors[0].message).toBe('Error 10');
    });

    test('should truncate long error messages', () => {
      const longMessage = 'x'.repeat(300);
      trackError({ statusCode: 500, message: longMessage });
      expect(metrics.recentErrors[0].message).toHaveLength(200);
    });

    test('should handle errors without path', () => {
      trackError({ statusCode: 500, message: 'No path' });
      expect(metrics.recentErrors[0].path).toBeNull();
    });

    test('should default statusCode to 500', () => {
      trackError({ message: 'No status' });
      expect(metrics.recentErrors[0].statusCode).toBe(500);
    });
  });
});