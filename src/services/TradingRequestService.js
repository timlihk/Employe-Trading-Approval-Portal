const TradingRequest = require('../models/TradingRequest');
const RestrictedStock = require('../models/RestrictedStock');
const AuditLog = require('../models/AuditLog');
const { AppError } = require('../middleware/errorHandler');
const { logger } = require('../utils/logger');

class TradingRequestService {
  /**
   * Validate ticker with external API
   */
  async validateTicker(ticker) {
    try {
      // Use Yahoo Finance API to validate ticker and get basic info
      const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(ticker)}`;
      
      // Add timeout to prevent hanging
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 5000); // 5 second timeout
      
      const response = await fetch(url, {
        signal: controller.signal,
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
        }
      });
      clearTimeout(timeoutId);
      
      const data = await response.json();
      
      if (data && data.chart && data.chart.result && data.chart.result.length > 0) {
        const result = data.chart.result[0];
        const meta = result.meta;
        
        if (meta && meta.symbol) {
          return {
            isValid: true,
            symbol: meta.symbol,
            currency: meta.currency || 'USD',
            exchangeName: meta.exchangeName || 'Unknown',
            longName: meta.longName || meta.shortName || `${ticker} Corporation`,
            regularMarketPrice: meta.regularMarketPrice || 0
          };
        }
      }
      
      return {
        isValid: false,
        error: 'Ticker not found or invalid'
      };
    } catch (error) {
      logger.error('Ticker validation failed', {
        ticker,
        error: error.message
      });
      
      if (error.name === 'AbortError') {
        return {
          isValid: false,
          error: 'Ticker validation timed out'
        };
      }
      
      return {
        isValid: false,
        error: 'Unable to validate ticker'
      };
    }
  }

  /**
   * Check if a stock is restricted
   */
  async checkRestrictedStatus(ticker) {
    try {
      return await RestrictedStock.isRestricted(ticker);
    } catch (error) {
      logger.error('Error checking restricted status', {
        ticker,
        error: error.message
      });
      throw new AppError('Unable to check stock restrictions', 500);
    }
  }

  /**
   * Create a trading request with validation
   */
  async createTradingRequest(requestData, employeeEmail, ipAddress = null) {
    const { ticker, shares, trading_type } = requestData;
    
    try {
      // Validate ticker
      const tickerValidation = await this.validateTicker(ticker.toUpperCase());
      if (!tickerValidation.isValid) {
        throw new AppError(`Invalid ticker: ${ticker}. ${tickerValidation.error}`, 400);
      }

      // Check if stock is restricted
      const isRestricted = await this.checkRestrictedStatus(ticker.toUpperCase());
      if (isRestricted) {
        throw new AppError(`${ticker.toUpperCase()} is on the restricted trading list and cannot be traded`, 403);
      }

      // Calculate estimated values
      const sharePrice = tickerValidation.regularMarketPrice || 0;
      const estimatedValue = sharePrice * parseInt(shares);
      
      // Create trading request
      const tradingRequestData = {
        employee_email: employeeEmail.toLowerCase(),
        stock_name: tickerValidation.longName,
        ticker: ticker.toUpperCase(),
        shares: parseInt(shares),
        share_price: sharePrice,
        total_value: estimatedValue,
        currency: tickerValidation.currency,
        share_price_usd: sharePrice, // Assume USD for now
        total_value_usd: estimatedValue,
        exchange_rate: 1,
        trading_type: trading_type.toLowerCase(),
        estimated_value: estimatedValue
      };

      const request = await TradingRequest.create(tradingRequestData);

      // Log the creation
      await AuditLog.logActivity(
        employeeEmail,
        'employee',
        'create_trading_request',
        'trading_request',
        request.id,
        `Created ${trading_type} request for ${shares} shares of ${ticker.toUpperCase()}`,
        ipAddress
      );

      logger.info('Trading request created', {
        requestId: request.id,
        employee: employeeEmail,
        ticker: ticker.toUpperCase(),
        shares,
        trading_type,
        estimatedValue
      });

      return {
        request,
        tickerInfo: tickerValidation
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
   * Get trading requests for an employee with filters
   */
  async getEmployeeRequests(employeeEmail, filters = {}) {
    try {
      const requestFilters = {
        employee_email: employeeEmail,
        ...filters
      };

      return await TradingRequest.getFilteredHistory(requestFilters);
    } catch (error) {
      logger.error('Error fetching employee requests', {
        employee: employeeEmail,
        filters,
        error: error.message
      });
      throw new AppError('Unable to fetch trading requests', 500);
    }
  }

  /**
   * Escalate a trading request
   */
  async escalateRequest(requestId, escalationReason, employeeEmail, ipAddress = null) {
    try {
      // Check if request exists and belongs to employee
      const request = await TradingRequest.getById(requestId);
      if (!request) {
        throw new AppError('Trading request not found', 404);
      }

      if (request.employee_email !== employeeEmail.toLowerCase()) {
        throw new AppError('Unauthorized to escalate this request', 403);
      }

      if (request.status !== 'pending') {
        throw new AppError('Only pending requests can be escalated', 400);
      }

      if (request.escalated) {
        throw new AppError('Request has already been escalated', 400);
      }

      // Escalate the request
      await TradingRequest.escalate(requestId, escalationReason);

      // Log the escalation
      await AuditLog.logActivity(
        employeeEmail,
        'employee',
        'escalate_trading_request',
        'trading_request',
        requestId,
        `Escalated request: ${escalationReason}`,
        ipAddress
      );

      logger.info('Trading request escalated', {
        requestId,
        employee: employeeEmail,
        reason: escalationReason
      });

      return true;
    } catch (error) {
      if (error instanceof AppError) {
        throw error;
      }
      
      logger.error('Error escalating request', {
        requestId,
        employee: employeeEmail,
        error: error.message
      });
      
      throw new AppError('Unable to escalate request', 500);
    }
  }
}

module.exports = new TradingRequestService();