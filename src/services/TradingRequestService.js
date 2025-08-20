const TradingRequest = require('../models/TradingRequest');
const RestrictedStock = require('../models/RestrictedStock');
const AuditLog = require('../models/AuditLog');
const CurrencyService = require('./CurrencyService');
const ISINServiceClass = require('./ISINService');
const ISINService = new ISINServiceClass();
const MockDataService = require('./MockDataService');
const database = require('../models/database');
const { AppError } = require('../middleware/errorHandler');
const { logger } = require('../utils/logger');
const { SimpleCache } = require('../utils/simpleCache');
const { CircuitBreaker, callWithResilience } = require('../utils/retryBreaker');

// Initialize ticker validation cache and circuit breaker
const tickerCache = new SimpleCache(5 * 60 * 1000); // 5 minutes TTL
const tickerCircuitBreaker = new CircuitBreaker({
  failureThreshold: 3,
  cooldownMs: 30000 // 30 seconds
});

class TradingRequestService {
  /**
   * Validate ticker with external API, caching, and circuit breaker
   */
  async validateTicker(ticker) {
    const cacheKey = `ticker:${ticker.toUpperCase()}`;
    
    // Try cache first
    const cached = tickerCache.get(cacheKey);
    if (cached) {
      logger.debug('Ticker cache hit', { ticker, cached: !!cached });
      return cached;
    }

    try {
      // Use circuit breaker and retry logic
      const result = await callWithResilience(
        async () => {
          // Yahoo Finance API call
          const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(ticker)}`;
          
          const controller = new AbortController();
          const timeoutId = setTimeout(() => controller.abort(), 5000);
          
          const response = await fetch(url, {
            signal: controller.signal,
            headers: {
              'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
            }
          });
          clearTimeout(timeoutId);
          
          if (!response.ok) {
            throw new Error(`HTTP ${response.status}: ${response.statusText}`);
          }
          
          const data = await response.json();
          
          if (data?.chart?.result?.[0]?.meta?.symbol) {
            const meta = data.chart.result[0].meta;
            
            // Check if this is a valid ticker with actual market data
            // Yahoo Finance returns placeholder data for non-existent tickers
            const validInstrumentTypes = ['EQUITY', 'ETF', 'INDEX']; // Accept stocks, ETFs, and index funds
            const isValidTicker = (
              meta.currency !== null && // Must have a currency
              validInstrumentTypes.includes(meta.instrumentType) && // Must be a tradeable instrument
              (meta.regularMarketPrice > 0 || meta.previousClose > 0) && // Must have price data
              (meta.longName || meta.shortName) && // Must have a company name
              meta.exchangeName !== 'YHD' && // YHD is a placeholder exchange for invalid tickers
              meta.exchangeName !== null // Must have an exchange
            );
            
            if (!isValidTicker) {
              return {
                isValid: false,
                error: `Ticker "${ticker}" not found or not a valid tradeable instrument. Please verify the ticker symbol is correct and that it's an equity, ETF, or index fund`
              };
            }
            
            return {
              isValid: true,
              symbol: meta.symbol,
              currency: meta.currency || 'USD',
              exchangeName: meta.exchangeName || 'Unknown',
              longName: meta.longName || meta.shortName || `${ticker} Corporation`,
              regularMarketPrice: meta.regularMarketPrice || meta.previousClose || 0,
              instrument_type: meta.instrumentType?.toLowerCase() || 'equity' // Return actual instrument type
            };
          }
          
          return {
            isValid: false,
            error: 'Ticker not found in market data. Please verify the ticker symbol is correct and the stock is actively traded'
          };
        },
        tickerCircuitBreaker,
        { retries: 2, delayMs: 300 }
      );

      // Cache successful results (both valid and invalid tickers)
      tickerCache.set(cacheKey, result);
      logger.debug('Ticker validation completed', { ticker, isValid: result.isValid, fromCache: false });
      
      return result;
      
    } catch (error) {
      logger.error('Ticker validation failed after retries', {
        ticker,
        error: error.message,
        circuitState: tickerCircuitBreaker.getState()
      });

      // Try to return cached value even if expired
      const staleCache = tickerCache.keyToEntry.get(cacheKey);
      if (staleCache) {
        logger.warn('Using stale ticker cache due to API failure', { ticker });
        return staleCache.value;
      }

      // Graceful degradation
      if (error.message.includes('Circuit breaker is OPEN')) {
        return {
          isValid: false,
          error: 'Ticker validation service is temporarily unavailable. Please try again in a few minutes.'
        };
      }

      if (error.name === 'AbortError') {
        return {
          isValid: false,
          error: 'Ticker validation timed out. Please try again'
        };
      }
      
      return {
        isValid: false,
        error: 'Unable to validate ticker due to network issues. Please try again'
      };
    }
  }

  /**
   * Validate ticker or ISIN and determine instrument type
   */
  async validateTickerOrISIN(tickerOrISIN) {
    try {
      const cleanInput = tickerOrISIN.trim().toUpperCase();
      
      // Check if it's an ISIN first
      if (ISINServiceClass.detectISIN(cleanInput)) {
        const isinResult = await ISINService.validateISIN(cleanInput);
        
        if (isinResult.valid) {
          return {
            isValid: true,
            instrument_type: 'bond',
            ticker: cleanInput,
            name: isinResult.name || `Bond ${cleanInput}`,
            currency: isinResult.currency || 'USD',
            issuer: isinResult.issuer,
            exchange: isinResult.exchange || null,
            isin: cleanInput
          };
        } else {
          return {
            isValid: false,
            error: isinResult.error || 'Invalid ISIN format',
            instrument_type: 'bond'
          };
        }
      }
      
      // If not an ISIN, validate as stock ticker
      const tickerResult = await this.validateTicker(cleanInput);
      
      if (tickerResult.isValid) {
        return {
          ...tickerResult,
          instrument_type: 'equity',
          ticker: cleanInput
        };
      }
      
      return {
        isValid: false,
        error: tickerResult.error || 'Invalid ticker',
        instrument_type: 'equity'
      };
      
    } catch (error) {
      logger.error('Error validating ticker or ISIN:', error);
      return {
        isValid: false,
        error: 'Unable to validate ticker/ISIN at this time',
        instrument_type: 'equity'
      };
    }
  }

  /**
   * Get cache and circuit breaker stats for monitoring
   */
  getTickerValidationStats() {
    return {
      cache: tickerCache.getStats(),
      circuitBreaker: tickerCircuitBreaker.getStats()
    };
  }

  /**
   * Check if a stock is restricted
   */
  async checkRestrictedStatus(ticker) {
    try {
      // Use mock data if no database
      if (!database.getPool()) {
        return await MockDataService.checkRestrictedStatus(ticker);
      }
      
      return await RestrictedStock.isRestricted(ticker);
    } catch (error) {
      logger.error('Error checking restricted status', {
        ticker,
        error: error.message
      });
      // Return false instead of throwing error for local testing
      return false;
    }
  }

  /**
   * Create a trading request with validation
   */
  async createTradingRequest(requestData, employeeEmail, ipAddress = null) {
    const { ticker, shares, trading_type } = requestData;
    
    try {
      // Validate ticker or ISIN
      const validation = await this.validateTickerOrISIN(ticker.toUpperCase());
      if (!validation.isValid) {
        const instrumentType = validation.instrument_type === 'bond' ? 'ISIN' : 'ticker';
        throw new AppError(`Invalid ${instrumentType}: ${ticker}. ${validation.error}`, 400);
      }

      // Check if instrument is restricted
      const isRestricted = await this.checkRestrictedStatus(ticker.toUpperCase());

      // Calculate estimated values
      // For bonds, assume unit price = $1 USD (face value). For stocks, use market price
      const instrumentType = validation.instrument_type || 'equity';
      const sharePrice = instrumentType === 'bond' ? 1 : (validation.regularMarketPrice || validation.price || 100);
      const estimatedValue = sharePrice * parseInt(shares);
      
      // Convert to USD if needed
      const currency = validation.currency || 'USD';
      const instrumentName = validation.longName || validation.name || `${instrumentType} ${ticker.toUpperCase()}`;
      let sharePriceUSD = sharePrice;
      let totalValueUSD = estimatedValue;
      let exchangeRate = 1;
      
      if (currency !== 'USD') {
        const conversion = await CurrencyService.convertToUSD(sharePrice, currency);
        sharePriceUSD = conversion.usdAmount;
        totalValueUSD = sharePriceUSD * parseInt(shares);
        exchangeRate = conversion.exchangeRate;
        
        logger.info('Foreign currency converted to USD', {
          ticker: ticker.toUpperCase(),
          originalCurrency: currency,
          originalPrice: sharePrice,
          usdPrice: sharePriceUSD,
          exchangeRate: exchangeRate
        });
      }
      
      // Determine initial status and rejection reason based on restricted list
      let initialStatus = 'pending';
      let rejectionReason = null;
      
      if (isRestricted) {
        // Automatically reject restricted instruments
        initialStatus = 'rejected';
        const instType = instrumentType === 'bond' ? 'bond' : 'stock';
        rejectionReason = `${ticker.toUpperCase()} is on the restricted trading list. This ${instType} request has been automatically rejected. You may escalate with a business justification if needed.`;
      } else {
        // Automatically approve non-restricted instruments
        initialStatus = 'approved';
      }
      
      // Create trading request with automatic status
      const tradingRequestData = {
        employee_email: employeeEmail.toLowerCase(),
        stock_name: instrumentName,
        ticker: ticker.toUpperCase(),
        shares: parseInt(shares),
        share_price: sharePrice,
        total_value: estimatedValue,
        currency: currency,
        share_price_usd: sharePriceUSD,
        total_value_usd: totalValueUSD,
        exchange_rate: exchangeRate,
        trading_type: trading_type.toLowerCase(),
        instrument_type: instrumentType,
        estimated_value: totalValueUSD, // Use USD value for estimated_value
        status: initialStatus,
        rejection_reason: rejectionReason,
        processed_at: new Date().toISOString()
      };

      let request;
      if (!database.getPool()) {
        // Use mock data service for local testing
        request = await MockDataService.createTradingRequest(tradingRequestData);
      } else {
        request = await TradingRequest.create(tradingRequestData);
      }

      // Log the creation with appropriate action
      const logAction = isRestricted ? 'create_rejected_trading_request' : 'create_approved_trading_request';
      const unitType = instrumentType === 'bond' ? 'units' : 'shares';
      const instType = instrumentType === 'bond' ? 'bond' : 'stock';
      const logDetails = isRestricted 
        ? `Created ${trading_type} request for ${shares} ${unitType} of ${ticker.toUpperCase()} - AUTOMATICALLY REJECTED (restricted ${instType})`
        : `Created ${trading_type} request for ${shares} ${unitType} of ${ticker.toUpperCase()} - AUTOMATICALLY APPROVED`;
        
      // Log activity if database is available
      if (database.getPool()) {
        try {
          await AuditLog.logActivity(
            employeeEmail,
            'employee',
            logAction,
            'trading_request',
            request.uuid,
            logDetails,
            ipAddress
          );
        } catch (error) {
          logger.warn('Could not log audit activity', { error: error.message });
        }
      }

      logger.info('Trading request created with automatic processing', {
        requestId: request.uuid,
        employee: employeeEmail,
        ticker: ticker.toUpperCase(),
        shares,
        trading_type,
        originalValue: estimatedValue,
        originalCurrency: currency,
        estimatedValueUSD: totalValueUSD,
        exchangeRate: exchangeRate,
        status: initialStatus,
        isRestricted
      });

      return {
        request,
        tickerInfo: validation,
        isRestricted,
        autoProcessed: true,
        instrumentType
      };
      
    } catch (error) {
      if (error instanceof AppError) {
        throw error;
      }
      
      logger.error('Error creating trading request', {
        employee: employeeEmail,
        ticker,
        error: error.message
      });
      
      throw new AppError('Unable to create trading request', 500);
    }
  }

  /**
   * Get trading requests for an employee with filters and sorting
   */
  async getEmployeeRequests(employeeEmail, filters = {}, sortBy = 'id', sortOrder = 'DESC') {
    try {
      const requestFilters = {
        employee_email: employeeEmail,
        ...filters
      };

      return await TradingRequest.getFilteredHistory(requestFilters, sortBy, sortOrder);
    } catch (error) {
      logger.error('Error fetching employee requests', {
        employee: employeeEmail,
        filters,
        sortBy,
        sortOrder,
        error: error.message
      });
      throw new AppError('Unable to fetch trading requests', 500);
    }
  }

  /**
   * Escalate a trading request
   */
  async escalateRequest(requestUuid, escalationReason, employeeEmail, ipAddress = null) {
    try {
      // Check if request exists and belongs to employee
      const request = await TradingRequest.getByUuid(requestUuid);
      if (!request) {
        throw new AppError('Trading request not found', 404);
      }

      if (request.employee_email !== employeeEmail.toLowerCase()) {
        throw new AppError('Unauthorized to escalate this request', 403);
      }

      if (request.status !== 'pending' && request.status !== 'rejected') {
        throw new AppError('Only pending or rejected requests can be escalated', 400);
      }

      if (request.escalated) {
        throw new AppError('Request has already been escalated', 400);
      }

      // Escalate the request
      await TradingRequest.escalate(requestUuid, escalationReason);

      // Log the escalation
      await AuditLog.logActivity(
        employeeEmail,
        'employee',
        'escalate_trading_request',
        'trading_request',
        requestUuid,
        `Escalated request: ${escalationReason}`,
        ipAddress
      );

      logger.info('Trading request escalated', {
        requestUuid,
        employee: employeeEmail,
        reason: escalationReason
      });

      return true;
    } catch (error) {
      if (error instanceof AppError) {
        throw error;
      }
      
      logger.error('Error escalating request', {
        requestUuid,
        employee: employeeEmail,
        error: error.message
      });
      
      throw new AppError('Unable to escalate request', 500);
    }
  }
}

module.exports = new TradingRequestService();