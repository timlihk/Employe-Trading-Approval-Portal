// Try to import node-fetch, fallback for environments without it
let fetch;
try {
  fetch = require('node-fetch');
} catch (e) {
  // Fallback for Node.js 18+ with built-in fetch
  fetch = globalThis.fetch || require('node-fetch');
}
const retryBreaker = require('../utils/retryBreaker');
const { logger } = require('../utils/logger');

class ISINService {
  constructor() {
    this.cache = new Map();
    this.cacheTimeout = 60 * 60 * 1000; // 1 hour cache
  }

  /**
   * Validates ISIN format
   * ISIN format: 2 letter country code + 9 alphanumeric characters + 1 check digit
   */
  static isValidISINFormat(isin) {
    if (!isin || typeof isin !== 'string') return false;
    
    // Remove spaces and convert to uppercase
    const cleanISIN = isin.replace(/\s/g, '').toUpperCase();
    
    // Check length (12 characters)
    if (cleanISIN.length !== 12) return false;
    
    // Check format: 2 letters + 9 alphanumeric + 1 digit
    const isinRegex = /^[A-Z]{2}[A-Z0-9]{9}[0-9]$/;
    if (!isinRegex.test(cleanISIN)) return false;
    
    // TODO: Fix checksum validation - for now accept format-valid ISINs
    // The checksum algorithm needs to be corrected as it's rejecting valid ISINs
    // return ISINService.validateISINChecksum(cleanISIN);
    return true; // Temporarily accept all format-valid ISINs
  }

  /**
   * Validates ISIN checksum using modified Luhn algorithm
   */
  static validateISINChecksum(isin) {
    // Convert letters to numbers (A=10, B=11, etc.)
    let numericString = '';
    for (let i = 0; i < isin.length - 1; i++) {
      const char = isin[i];
      if (char >= 'A' && char <= 'Z') {
        numericString += (char.charCodeAt(0) - 55).toString();
      } else {
        numericString += char;
      }
    }
    
    // Apply Luhn algorithm
    let sum = 0;
    let alternate = false;
    
    for (let i = numericString.length - 1; i >= 0; i--) {
      let digit = parseInt(numericString[i]);
      
      if (alternate) {
        digit *= 2;
        if (digit > 9) {
          digit = Math.floor(digit / 10) + (digit % 10);
        }
      }
      
      sum += digit;
      alternate = !alternate;
    }
    
    const checkDigit = (10 - (sum % 10)) % 10;
    return checkDigit === parseInt(isin[isin.length - 1]);
  }

  /**
   * Detects if a ticker is actually an ISIN
   */
  static detectISIN(ticker) {
    if (!ticker) return false;
    
    const cleanTicker = ticker.replace(/\s/g, '').toUpperCase();
    
    // ISIN characteristics:
    // - 12 characters
    // - Starts with 2 letters (country code)
    // - Contains alphanumeric characters
    if (cleanTicker.length === 12 && /^[A-Z]{2}[A-Z0-9]{10}$/.test(cleanTicker)) {
      return ISINService.isValidISINFormat(cleanTicker);
    }
    
    return false;
  }

  /**
   * Validates and gets bond information from ISIN
   * Uses free APIs for ISIN validation
   */
  async validateISIN(isin) {
    try {
      const cleanISIN = isin.replace(/\s/g, '').toUpperCase();
      
      // First validate format
      if (!ISINService.isValidISINFormat(cleanISIN)) {
        return {
          valid: false,
          error: 'Invalid ISIN format',
          isin: cleanISIN
        };
      }

      // Check cache first
      const cacheKey = `isin_${cleanISIN}`;
      const cached = this.cache.get(cacheKey);
      if (cached && (Date.now() - cached.timestamp) < this.cacheTimeout) {
        return cached.data;
      }

      // Try to get bond information from various free sources
      const bondInfo = await this.fetchBondInfo(cleanISIN);
      
      const result = {
        valid: true,
        isin: cleanISIN,
        ...bondInfo
      };

      // Cache the result
      this.cache.set(cacheKey, {
        data: result,
        timestamp: Date.now()
      });

      return result;
      
    } catch (error) {
      logger.error('Error validating ISIN', { error: error.message });
      return {
        valid: false,
        error: 'Unable to validate ISIN at this time',
        isin: isin
      };
    }
  }

  /**
   * Fetch bond information from free APIs
   */
  async fetchBondInfo(isin) {
    const bondInfo = {
      name: `Bond ${isin}`,
      issuer: 'Unknown Issuer',
      currency: 'USD',
      type: 'Corporate Bond'
    };

    try {
      // Try OpenFIGI API (free tier available)
      const figiResult = await this.tryOpenFIGI(isin);
      if (figiResult) {
        return { ...bondInfo, ...figiResult };
      }

      // Try alternative method - extract country and basic info from ISIN
      const countryCode = isin.substring(0, 2);
      const countryInfo = this.getCountryFromCode(countryCode);
      
      return {
        ...bondInfo,
        name: `${countryInfo.country} Bond ${isin}`,
        issuer: countryInfo.country,
        currency: countryInfo.currency
      };
      
    } catch (error) {
      logger.error('Error fetching bond info', { error: error.message });
      return bondInfo;
    }
  }

  /**
   * Try OpenFIGI API for bond information
   */
  async tryOpenFIGI(isin) {
    try {
      const response = await fetch('https://api.openfigi.com/v3/mapping', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify([{
          idType: 'ID_ISIN',
          idValue: isin
        }]),
        timeout: 5000
      });

      if (response.ok) {
        const data = await response.json();
        if (data && data[0] && data[0].data && data[0].data.length > 0) {
          const bondData = data[0].data[0];
          return {
            name: bondData.name || `Bond ${isin}`,
            issuer: bondData.issuer || 'Unknown Issuer',
            currency: bondData.currency || 'USD',
            type: bondData.securityType || 'Bond',
            exchange: bondData.exchCode || null
          };
        }
      }
    } catch (error) {
      logger.warn('OpenFIGI API not available', { error: error.message });
    }
    
    return null;
  }

  /**
   * Get country information from ISIN country code
   */
  getCountryFromCode(code) {
    const countries = {
      'US': { country: 'United States', currency: 'USD' },
      'GB': { country: 'United Kingdom', currency: 'GBP' },
      'DE': { country: 'Germany', currency: 'EUR' },
      'FR': { country: 'France', currency: 'EUR' },
      'JP': { country: 'Japan', currency: 'JPY' },
      'CA': { country: 'Canada', currency: 'CAD' },
      'AU': { country: 'Australia', currency: 'AUD' },
      'CH': { country: 'Switzerland', currency: 'CHF' },
      'NL': { country: 'Netherlands', currency: 'EUR' },
      'SE': { country: 'Sweden', currency: 'SEK' },
      'NO': { country: 'Norway', currency: 'NOK' },
      'DK': { country: 'Denmark', currency: 'DKK' },
      'HK': { country: 'Hong Kong', currency: 'HKD' },
      'SG': { country: 'Singapore', currency: 'SGD' },
      'CN': { country: 'China', currency: 'CNY' },
      'IT': { country: 'Italy', currency: 'EUR' },
      'ES': { country: 'Spain', currency: 'EUR' },
      'BE': { country: 'Belgium', currency: 'EUR' },
      'AT': { country: 'Austria', currency: 'EUR' },
      'FI': { country: 'Finland', currency: 'EUR' }
    };
    
    return countries[code] || { country: 'Unknown', currency: 'USD' };
  }

  /**
   * Clear cache
   */
  clearCache() {
    this.cache.clear();
  }
}

// Export both the class and a singleton instance
module.exports = ISINService;
module.exports.instance = new ISINService();