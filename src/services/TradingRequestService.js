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
const { AUTO_APPROVE, CACHE } = require('../config/constants');

// Initialize ticker validation cache and circuit breaker
const tickerCache = new SimpleCache(CACHE.TICKER_TTL_MS);
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
   * Validates ticker or ISIN format and fetches market data
   * @private
   */
  async _validateAndFetchTicker(ticker) {
    const validation = await this.validateTickerOrISIN(ticker.toUpperCase());
    if (!validation.isValid) {
      const instrumentType = validation.instrument_type === 'bond' ? 'ISIN' : 'ticker';
      throw new AppError(`Invalid ${instrumentType}: ${ticker}. ${validation.error}`, 400);
    }
    return validation;
  }

  /**
   * Calculates estimated values for a trading request
   * @private
   */
  _calculateEstimatedValues(validation, shares) {
    const instrumentType = validation.instrument_type || 'equity';
    const sharePrice = instrumentType === 'bond' ? 1 : (validation.regularMarketPrice || validation.price || 100);
    const estimatedValue = sharePrice * parseInt(shares);

    return {
      instrumentType,
      sharePrice,
      estimatedValue,
      instrumentName: validation.longName || validation.name || `${instrumentType} ${validation.ticker || 'UNKNOWN'}`,
      currency: validation.currency || 'USD'
    };
  }

  /**
   * Converts currency to USD if needed
   * @private
   */
  async _convertToUSDIfNeeded(amount, currency, shares) {
    if (currency === 'USD') {
      return {
        usdAmount: amount,
        totalValueUSD: amount * parseInt(shares),
        exchangeRate: 1
      };
    }

    const conversion = await CurrencyService.convertToUSD(amount, currency);
    return {
      usdAmount: conversion.usdAmount,
      totalValueUSD: conversion.usdAmount * parseInt(shares),
      exchangeRate: conversion.exchangeRate
    };
  }

  /**
   * Determines initial status and rejection reason based on restricted list
   * @private
   */
  _determineInitialStatus(isRestricted, ticker, instrumentType, tradingType, shortTermTrades = []) {
    if (isRestricted) {
      const instType = instrumentType === 'bond' ? 'bond' : 'stock';
      return {
        initialStatus: 'rejected',
        rejectionReason: `${ticker.toUpperCase()} is on the restricted trading list. This ${instType} request has been automatically rejected. You may escalate with a business justification if needed.`,
        autoEscalate: false
      };
    }

    if (shortTermTrades.length > 0) {
      const trade = shortTermTrades[0];
      const oppositeAction = trade.trading_type === 'buy' ? 'bought' : 'sold';
      const tradeDate = new Date(trade.created_at).toLocaleDateString('en-GB');
      const daysAgo = Math.ceil((Date.now() - new Date(trade.created_at)) / (1000 * 60 * 60 * 24));
      return {
        initialStatus: 'pending',
        rejectionReason: null,
        autoEscalate: true,
        escalationReason: `Short-term trading detected: You ${oppositeAction} ${trade.shares} shares of ${ticker.toUpperCase()} on ${tradeDate} (${daysAgo} days ago). SFC FMCC requires a minimum 30-day holding period. This request has been auto-escalated for compliance review.`
      };
    }

    return {
      initialStatus: 'approved',
      rejectionReason: null,
      autoEscalate: false
    };
  }

  /**
   * Creates trading request data object
   * @private
   */
  _createTradingRequestData(requestData, employeeEmail, values, validation) {
    const { ticker, shares, trading_type } = requestData;
    const { instrumentName, sharePrice, estimatedValue, currency, instrumentType } = values;

    return {
      employee_email: employeeEmail.toLowerCase(),
      stock_name: instrumentName,
      ticker: ticker.toUpperCase(),
      shares: parseInt(shares),
      share_price: sharePrice,
      total_value: estimatedValue,
      currency,
      share_price_usd: values.sharePriceUSD || sharePrice,
      total_value_usd: values.totalValueUSD || estimatedValue,
      exchange_rate: values.exchangeRate || 1,
      trading_type: trading_type.toLowerCase(),
      instrument_type: instrumentType,
      status: values.initialStatus,
      rejection_reason: values.rejectionReason,
      processed_at: new Date().toISOString()
    };
  }

  /**
   * Logs trading request creation activity
   * @private
   */
  async _logTradingRequestCreation(employeeEmail, request, ticker, shares, tradingType, instrumentType, isRestricted, ipAddress) {
    const isEscalated = request.escalated || (request.status === 'pending');
    let logAction, logDetails;
    const unitType = instrumentType === 'bond' ? 'units' : 'shares';
    const instType = instrumentType === 'bond' ? 'bond' : 'stock';

    if (isRestricted) {
      logAction = 'create_rejected_trading_request';
      logDetails = `Created ${tradingType} request for ${shares} ${unitType} of ${ticker.toUpperCase()} - AUTOMATICALLY REJECTED (restricted ${instType})`;
    } else if (isEscalated) {
      logAction = 'create_escalated_trading_request';
      logDetails = `Created ${tradingType} request for ${shares} ${unitType} of ${ticker.toUpperCase()} - AUTO-ESCALATED (30-day short-term trading rule)`;
    } else {
      logAction = 'create_approved_trading_request';
      logDetails = `Created ${tradingType} request for ${shares} ${unitType} of ${ticker.toUpperCase()} - AUTOMATICALLY APPROVED`;
    }

    if (database.getPool()) {
      try {
        await this.logActivity(
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
  }

  /**
   * Create a trading request with validation
   */
  async createTradingRequest(requestData, employeeEmail, ipAddress = null) {
    const { ticker, shares, trading_type } = requestData;

    try {
      // Step 1: Validate ticker/ISIN
      const validation = await this._validateAndFetchTicker(ticker);

      // Step 2: Check if instrument is restricted
      const isRestricted = await this.checkRestrictedStatus(ticker.toUpperCase());

      // Step 3: Calculate estimated values
      const values = this._calculateEstimatedValues(validation, shares);

      // Step 4: Convert to USD if needed
      const conversion = await this._convertToUSDIfNeeded(values.sharePrice, values.currency, shares);
      values.sharePriceUSD = conversion.usdAmount;
      values.totalValueUSD = conversion.totalValueUSD;
      values.exchangeRate = conversion.exchangeRate;

      if (values.currency !== 'USD') {
        logger.info('Foreign currency converted to USD', {
          ticker: ticker.toUpperCase(),
          originalCurrency: values.currency,
          originalPrice: values.sharePrice,
          usdPrice: values.sharePriceUSD,
          exchangeRate: values.exchangeRate
        });
      }

      // Step 4.5: Check for short-term trading (30-day rule)
      let shortTermTrades = [];
      if (!isRestricted && database.getPool()) {
        try {
          shortTermTrades = await TradingRequest.findRecentOppositeTradesByEmployee(
            employeeEmail, ticker, trading_type, 30
          );
        } catch (err) {
          logger.warn('Could not check short-term trading history', { error: err.message });
        }
      }

      // Step 5: Determine initial status
      const statusResult = this._determineInitialStatus(isRestricted, ticker, values.instrumentType, trading_type, shortTermTrades);

      // Step 6: Create trading request data
      const tradingRequestData = this._createTradingRequestData(requestData, employeeEmail, { ...values, ...statusResult }, validation);

      // Step 7: Save to database
      let request;
      if (!database.getPool()) {
        // Use mock data service for local testing
        request = await MockDataService.createTradingRequest(tradingRequestData);
      } else {
        request = await TradingRequest.create(tradingRequestData);
      }

      // Step 7.5: Auto-escalate if short-term trading detected
      if (statusResult.autoEscalate && database.getPool()) {
        await TradingRequest.escalate(request.uuid, statusResult.escalationReason);

        // Schedule auto-approve after random delay within compliance window
        const delayMinutes = AUTO_APPROVE.MIN_MINUTES + Math.floor(Math.random() * AUTO_APPROVE.RANGE_MINUTES);
        const delayMs = delayMinutes * 60 * 1000;
        const requestUuid = request.uuid;
        const email = employeeEmail;

        setTimeout(async () => {
          try {
            const result = await TradingRequest.autoApprove(requestUuid);
            if (result && result.length > 0) {
              await AuditLog.logActivity(
                email, 'system', 'auto_approve_escalated_request',
                'trading_request', requestUuid,
                `Auto-approved after ${delayMinutes}-minute compliance review period (short-term trading flag)`
              );
              logger.info('Auto-approved escalated request', { uuid: requestUuid, delayMinutes });
            }
          } catch (err) {
            logger.error('Failed to auto-approve escalated request', { uuid: requestUuid, error: err.message });
          }
        }, delayMs);

        logger.info('Short-term trading detected, request auto-escalated', {
          requestId: request.uuid,
          employee: employeeEmail,
          ticker: ticker.toUpperCase(),
          oppositeTradeDate: shortTermTrades[0]?.created_at,
          autoApproveIn: `${delayMinutes} minutes`
        });
      }

      // Step 8: Log activity
      await this._logTradingRequestCreation(employeeEmail, request, ticker, shares, trading_type, values.instrumentType, isRestricted, ipAddress);

      logger.info('Trading request created with automatic processing', {
        requestId: request.uuid,
        employee: employeeEmail,
        ticker: ticker.toUpperCase(),
        shares,
        trading_type,
        originalValue: values.estimatedValue,
        originalCurrency: values.currency,
        estimatedValueUSD: values.totalValueUSD,
        exchangeRate: values.exchangeRate,
        status: statusResult.initialStatus,
        isRestricted
      });

      return {
        request,
        tickerInfo: validation,
        isRestricted,
        autoProcessed: true,
        instrumentType: values.instrumentType
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
  async getEmployeeRequests(employeeEmail, filters = {}, sortBy = 'created_at', sortOrder = 'DESC') {
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