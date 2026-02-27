/**
 * Application metrics singleton
 */

const MAX_RECENT_ERRORS = 50;

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
      connectionErrors: 0,
      connectionStatus: 'unknown'
    },
    errorCategories: {
      validation: 0,
      authentication: 0,
      database: 0,
      externalApi: 0,
      notFound: 0,
      rateLimit: 0,
      unknown: 0
    },
    recentErrors: []
  };
}

function categorizeError(err) {
  const code = err.statusCode || 500;
  const msg = (err.message || '').toLowerCase();

  if (code === 404) return 'notFound';
  if (code === 429) return 'rateLimit';
  if (code === 401 || code === 403) return 'authentication';
  if (code === 400 || code === 422) return 'validation';
  if (/database|pool|connection|econnrefused|pg/.test(msg)) return 'database';
  if (/graph api|sharepoint|fetch|enotfound|timeout/.test(msg)) return 'externalApi';
  return 'unknown';
}

function trackError(err, path) {
  const category = categorizeError(err);
  metrics.errorCategories[category]++;

  metrics.recentErrors.push({
    timestamp: new Date().toISOString(),
    category,
    statusCode: err.statusCode || 500,
    message: (err.message || 'Unknown error').slice(0, 200),
    path: path || null
  });

  if (metrics.recentErrors.length > MAX_RECENT_ERRORS) {
    metrics.recentErrors.shift();
  }
}

const metrics = createMetrics();

module.exports = {
  metrics,
  createMetrics,
  trackError,
  categorizeError
};