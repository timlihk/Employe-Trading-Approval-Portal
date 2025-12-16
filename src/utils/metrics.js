/**
 * Application metrics singleton
 */

function createMetrics() {
  return {
    startTime: Date.now(),
    requests: 0,
    errors: 0,
    latencyBuckets: {
      under50ms: 0,
      under200ms: 0,
      under1000ms: 0,
      over1000ms: 0
    },
    externalApis: {
      tickerValidation: {
        cacheHits: 0,
        cacheMisses: 0,
        apiCalls: 0,
        apiErrors: 0,
        circuitBreakerOpens: 0
      },
      currencyExchange: {
        cacheHits: 0,
        cacheMisses: 0,
        apiCalls: 0,
        apiErrors: 0,
        circuitBreakerOpens: 0
      }
    },
    sessionStore: {
      fallbackEvents: 0,
      connectionErrors: 0
    },
    database: {
      queryCount: 0,
      errorCount: 0,
      slowQueryCount: 0,
      connectionStatus: 'unknown'
    }
  };
}

const metrics = createMetrics();

module.exports = {
  metrics,
  createMetrics
};