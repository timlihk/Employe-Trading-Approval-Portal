const { metrics, createMetrics } = require('../../src/utils/metrics');

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
    expect(metrics.database).toHaveProperty('connectionStatus', 'unknown');
  });

  test('createMetrics creates new metrics object', () => {
    const newMetrics = createMetrics();
    expect(newMetrics).not.toBe(metrics); // Different instance
    expect(newMetrics.startTime).toBeGreaterThan(0);
    expect(newMetrics.database.queryCount).toBe(0);
  });
});