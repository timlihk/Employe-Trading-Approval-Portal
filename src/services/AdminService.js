const RestrictedStock = require('../models/RestrictedStock');
const RestrictedStockChangelog = require('../models/RestrictedStockChangelog');
const TradingRequest = require('../models/TradingRequest');
const AuditLog = require('../models/AuditLog');
const { AppError } = require('../middleware/errorHandler');
const { logger } = require('../utils/logger');
const bcrypt = require('bcryptjs');

class AdminService {
  /**
   * Authenticate admin user with bcrypt password hashing
   */
  async authenticateAdmin(username, password) {
    try {
      const expectedUsername = process.env.ADMIN_USERNAME || 'admin';
      
      // Check username first
      if (username !== expectedUsername) {
        logger.warn('Admin authentication failed', { 
          username, 
          reason: 'Invalid username' 
        });
        return { authenticated: false };
      }

      // Check if we have bcrypt hash or fallback to plaintext (for migration)
      const passwordHash = process.env.ADMIN_PASSWORD_HASH;
      const plaintextPassword = process.env.ADMIN_PASSWORD;
      
      let isValidPassword = false;
      
      if (passwordHash) {
        // Use bcrypt hash (preferred method)
        isValidPassword = await bcrypt.compare(password, passwordHash);
        if (isValidPassword) {
          logger.info('Admin authentication successful (bcrypt)', { username });
        }
      } else if (plaintextPassword) {
        // Fallback to plaintext comparison (deprecated, log warning)
        isValidPassword = password === plaintextPassword;
        if (isValidPassword) {
          logger.warn('Admin authentication using plaintext password - UPGRADE TO BCRYPT HASH', { 
            username,
            security_warning: 'ADMIN_PASSWORD_HASH not set, using deprecated ADMIN_PASSWORD'
          });
        }
      }

      if (isValidPassword) {
        logger.info('Admin authentication successful', { username });
        return { username, authenticated: true };
      }

      logger.warn('Admin authentication failed', { 
        username, 
        reason: 'Invalid credentials',
        method: passwordHash ? 'bcrypt' : 'plaintext_fallback'
      });
      return { authenticated: false };
      
    } catch (error) {
      logger.error('Admin authentication error', {
        username,
        error: error.message
      });
      throw new AppError('Authentication service error', 500);
    }
  }

  /**
   * Generate bcrypt hash for admin password (utility method)
   */
  async generatePasswordHash(password) {
    const saltRounds = 12; // High security for admin accounts
    return await bcrypt.hash(password, saltRounds);
  }

  /**
   * Add stock to restricted list
   */
  async addRestrictedStock(ticker, adminEmail, ipAddress = null) {
    try {
      // Check if stock already exists
      const existingStock = await RestrictedStock.getByTicker(ticker);
      if (existingStock) {
        throw new AppError(`${ticker.toUpperCase()} is already in the restricted stocks list`, 409);
      }

      // Try to get company name from external API
      let companyName = 'Added via Admin Panel';
      try {
        const companyInfo = await this.getCompanyName(ticker);
        if (companyInfo) {
          companyName = companyInfo;
        }
      } catch (error) {
        logger.warn('Could not fetch company name', { ticker, error: error.message });
      }

      // Add stock to restricted list
      const stock = await RestrictedStock.add(ticker.toUpperCase(), companyName);

      // Log the change in changelog
      await RestrictedStockChangelog.logChange({
        ticker: ticker.toUpperCase(),
        company_name: companyName,
        action: 'added',
        admin_email: adminEmail,
        reason: 'Added via admin panel',
        ip_address: ipAddress
      });

      // Log in audit log
      await AuditLog.logActivity(
        adminEmail,
        'admin',
        'add_restricted_stock',
        'restricted_stock',
        stock.id,
        `Added ${ticker.toUpperCase()} (${companyName}) to restricted list`,
        ipAddress
      );

      logger.info('Restricted stock added', {
        ticker: ticker.toUpperCase(),
        companyName,
        admin: adminEmail
      });

      return {
        ticker: ticker.toUpperCase(),
        company_name: companyName,
        id: stock.id
      };

    } catch (error) {
      if (error instanceof AppError) {
        throw error;
      }

      logger.error('Error adding restricted stock', {
        ticker,
        admin: adminEmail,
        error: error.message
      });

      throw new AppError('Unable to add restricted stock', 500);
    }
  }

  /**
   * Remove stock from restricted list
   */
  async removeRestrictedStock(ticker, adminEmail, ipAddress = null) {
    try {
      // Check if stock exists
      const existingStock = await RestrictedStock.getByTicker(ticker);
      if (!existingStock) {
        throw new AppError(`${ticker.toUpperCase()} is not in the restricted stocks list`, 404);
      }

      // Remove stock
      const result = await RestrictedStock.remove(ticker.toUpperCase());

      if (result.changes === 0) {
        throw new AppError('Stock not found or already removed', 404);
      }

      // Log the change in changelog
      await RestrictedStockChangelog.logChange({
        ticker: ticker.toUpperCase(),
        company_name: existingStock.company_name,
        action: 'removed',
        admin_email: adminEmail,
        reason: 'Removed via admin panel',
        ip_address: ipAddress
      });

      // Log in audit log
      await AuditLog.logActivity(
        adminEmail,
        'admin',
        'remove_restricted_stock',
        'restricted_stock',
        existingStock.id,
        `Removed ${ticker.toUpperCase()} (${existingStock.company_name}) from restricted list`,
        ipAddress
      );

      logger.info('Restricted stock removed', {
        ticker: ticker.toUpperCase(),
        companyName: existingStock.company_name,
        admin: adminEmail
      });

      return true;

    } catch (error) {
      if (error instanceof AppError) {
        throw error;
      }

      logger.error('Error removing restricted stock', {
        ticker,
        admin: adminEmail,
        error: error.message
      });

      throw new AppError('Unable to remove restricted stock', 500);
    }
  }

  /**
   * Approve a trading request
   */
  async approveRequest(requestId, adminEmail, ipAddress = null) {
    try {
      const request = await TradingRequest.getById(requestId);
      if (!request) {
        throw new AppError('Trading request not found', 404);
      }

      if (request.status !== 'pending') {
        throw new AppError('Only pending requests can be approved', 400);
      }

      // Update status
      await TradingRequest.updateStatus(requestId, 'approved');

      // Log the action
      await AuditLog.logActivity(
        adminEmail,
        'admin',
        'approve_trading_request',
        'trading_request',
        requestId,
        `Approved ${request.trading_type} request for ${request.shares} shares of ${request.ticker} by ${request.employee_email}`,
        ipAddress
      );

      logger.info('Trading request approved', {
        requestId,
        admin: adminEmail,
        employee: request.employee_email,
        ticker: request.ticker
      });

      return true;

    } catch (error) {
      if (error instanceof AppError) {
        throw error;
      }

      logger.error('Error approving request', {
        requestId,
        admin: adminEmail,
        error: error.message
      });

      throw new AppError('Unable to approve request', 500);
    }
  }

  /**
   * Reject a trading request
   */
  async rejectRequest(requestId, rejectionReason, adminEmail, ipAddress = null) {
    try {
      const request = await TradingRequest.getById(requestId);
      if (!request) {
        throw new AppError('Trading request not found', 404);
      }

      if (request.status !== 'pending') {
        throw new AppError('Only pending requests can be rejected', 400);
      }

      // For escalated requests, use default reason if none provided
      const finalReason = rejectionReason || 
        (request.escalated ? 'Administrative decision - Request rejected after review' : null);
      
      // Update status with reason
      await TradingRequest.updateStatus(requestId, 'rejected', finalReason);

      // Log the action
      await AuditLog.logActivity(
        adminEmail,
        'admin',
        'reject_trading_request',
        'trading_request',
        requestId,
        `Rejected ${request.trading_type} request for ${request.shares} shares of ${request.ticker} by ${request.employee_email}.${finalReason ? ` Reason: ${finalReason}` : ''}`,
        ipAddress
      );

      logger.info('Trading request rejected', {
        requestId,
        admin: adminEmail,
        employee: request.employee_email,
        ticker: request.ticker,
        reason: finalReason
      });

      return true;

    } catch (error) {
      if (error instanceof AppError) {
        throw error;
      }

      logger.error('Error rejecting request', {
        requestId,
        admin: adminEmail,
        error: error.message
      });

      throw new AppError('Unable to reject request', 500);
    }
  }

  /**
   * Get company name from external API (helper method)
   */
  async getCompanyName(ticker) {
    try {
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
      
      const data = await response.json();
      
      if (data?.chart?.result?.[0]?.meta) {
        const meta = data.chart.result[0].meta;
        return meta.longName || meta.shortName || `${ticker} Corporation`;
      }
      
      return null;
    } catch (error) {
      logger.error('Error fetching company name', {
        ticker,
        error: error.message
      });
      return null;
    }
  }
}

module.exports = new AdminService();