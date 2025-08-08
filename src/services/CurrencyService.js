const { logger } = require('../utils/logger');

class CurrencyService {
  /**
   * Get exchange rate from source currency to USD
   * Uses exchangerate-api.com free tier (1500 requests/month)
   */
  async getExchangeRateToUSD(fromCurrency) {
    // If already USD, return 1
    if (fromCurrency === 'USD') {
      return 1;
    }

    try {
      // Use a free exchange rate API
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
      
      if (data && data.rates && data.rates.USD) {
        const rate = data.rates.USD;
        logger.info('Currency exchange rate retrieved', {
          fromCurrency,
          toUSD: rate,
          source: 'exchangerate-api.com'
        });
        return rate;
      } else {
        throw new Error('Invalid response format from exchange rate API');
      }
      
    } catch (error) {
      logger.error('Failed to get exchange rate', {
        fromCurrency,
        error: error.message
      });
      
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
        logger.warn('Using fallback exchange rate', {
          fromCurrency,
          fallbackRate: fallbackRates[fromCurrency]
        });
        return fallbackRates[fromCurrency];
      }
      
      // If no fallback available, assume 1:1 (not ideal but prevents crashes)
      logger.error('No exchange rate available, using 1:1 ratio', {
        fromCurrency
      });
      return 1;
    }
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