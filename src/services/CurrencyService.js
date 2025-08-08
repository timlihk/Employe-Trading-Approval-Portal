const { logger } = require('../utils/logger');
const { SimpleCache } = require('../utils/simpleCache');
const { CircuitBreaker, callWithResilience } = require('../utils/retryBreaker');

// Initialize currency cache and circuit breaker
const currencyCache = new SimpleCache(10 * 60 * 1000); // 10 minutes TTL
const currencyCircuitBreaker = new CircuitBreaker({
  failureThreshold: 3,
  cooldownMs: 60000 // 1 minute cooldown
});

class CurrencyService {
  /**
   * Get exchange rate from source currency to USD with caching and resilience
   * Uses exchangerate-api.com free tier (1500 requests/month)
   */
  async getExchangeRateToUSD(fromCurrency) {
    // If already USD, return 1
    if (fromCurrency === 'USD') {
      return 1;
    }

    const cacheKey = `fx:${fromCurrency.toUpperCase()}`;
    
    // Try cache first
    const cached = currencyCache.get(cacheKey);
    if (cached) {
      logger.debug('Currency cache hit', { fromCurrency, rate: cached });
      return cached;
    }

    try {
      const rate = await callWithResilience(
        async () => {
          const url = `https://api.exchangerate-api.com/v4/latest/${fromCurrency}`;
          
          const controller = new AbortController();
          const timeoutId = setTimeout(() => controller.abort(), 5000);
          
          const response = await fetch(url, {
            signal: controller.signal,
            headers: {
              'User-Agent': 'Trading-Compliance-Portal/1.0'
            }
          });
          clearTimeout(timeoutId);
          
          if (!response.ok) {
            throw new Error(`Exchange rate API responded with ${response.status}`);
          }
          
          const data = await response.json();
          
          if (data?.rates?.USD) {
            return data.rates.USD;
          } else {
            throw new Error('Invalid response format from exchange rate API');
          }
        },
        currencyCircuitBreaker,
        { retries: 2, delayMs: 500 }
      );

      // Cache the successful result
      currencyCache.set(cacheKey, rate);
      logger.info('Currency exchange rate retrieved', {
        fromCurrency,
        toUSD: rate,
        source: 'exchangerate-api.com',
        fromCache: false
      });
      
      return rate;
      
    } catch (error) {
      logger.error('Failed to get exchange rate after retries', {
        fromCurrency,
        error: error.message,
        circuitState: currencyCircuitBreaker.getState()
      });

      // Try stale cache first
      const staleCache = currencyCache.keyToEntry.get(cacheKey);
      if (staleCache) {
        logger.warn('Using stale currency cache due to API failure', { fromCurrency, rate: staleCache.value });
        return staleCache.value;
      }
      
      // Fallback: use approximate rates for major currencies
      const fallbackRates = {
        'EUR': 1.10,
        'GBP': 1.25,
        'JPY': 0.0067,
        'CAD': 0.74,
        'AUD': 0.66,
        'CHF': 1.09,
        'CNY': 0.14,
        'HKD': 0.128,
        'SGD': 0.74
      };
      
      if (fallbackRates[fromCurrency]) {
        const fallbackRate = fallbackRates[fromCurrency];
        // Cache fallback rate for a shorter period
        currencyCache.set(cacheKey, fallbackRate, 2 * 60 * 1000); // 2 minutes
        
        logger.warn('Using fallback exchange rate', {
          fromCurrency,
          fallbackRate
        });
        return fallbackRate;
      }
      
      // If no fallback available, assume 1:1 (not ideal but prevents crashes)
      logger.error('No exchange rate available, using 1:1 ratio', {
        fromCurrency
      });
      return 1;
    }
  }

  /**
   * Get currency service stats for monitoring
   */
  getCurrencyStats() {
    return {
      cache: currencyCache.getStats(),
      circuitBreaker: currencyCircuitBreaker.getStats()
    };
  }

  /**
   * Convert amount from source currency to USD
   */
  async convertToUSD(amount, fromCurrency) {
    const exchangeRate = await this.getExchangeRateToUSD(fromCurrency);
    const usdAmount = amount * exchangeRate;
    
    logger.info('Currency conversion completed', {
      originalAmount: amount,
      fromCurrency,
      exchangeRate,
      usdAmount
    });
    
    return {
      usdAmount,
      exchangeRate,
      originalAmount: amount,
      originalCurrency: fromCurrency
    };
  }
}

module.exports = new CurrencyService();