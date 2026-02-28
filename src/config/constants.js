'use strict';

module.exports = {
  AUTO_APPROVE: {
    MIN_MINUTES: 30,
    RANGE_MINUTES: 30,
  },
  CACHE: {
    TICKER_TTL_MS: 5 * 60 * 1000,    // 5 minutes
    CURRENCY_TTL_MS: 10 * 60 * 1000, // 10 minutes
    ISIN_TTL_MS: 60 * 60 * 1000,     // 1 hour
  },
  HTTP: {
    TIMEOUT_MS: 5000,
  },
};
