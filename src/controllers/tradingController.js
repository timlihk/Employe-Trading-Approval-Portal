const { validationResult } = require('express-validator');
const TradingRequest = require('../models/TradingRequest');
const RestrictedStock = require('../models/RestrictedStock');
const emailService = require('../utils/emailService');
const AuditLog = require('../models/AuditLog');
const stockService = require('../services/stockService');
const database = require('../models/database');

class TradingController {
  static async submitRequest(req, res) {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ 
          success: false, 
          errors: errors.array() 
        });
      }

      const { ticker, shares, trading_type } = req.body;
      
      // Use authenticated employee's email from session
      const employee_email = req.session.employeeEmail;
      
      const upperTicker = ticker.toUpperCase();
      
      // Get stock information and validate
      const stockInfo = await stockService.getStockInfo(upperTicker);
      if (!stockInfo.success) {
        return res.status(400).json({
          success: false,
          message: `Invalid ticker symbol: ${stockInfo.error}`
        });
      }

      // Get max trade amount from compliance settings
      let maxTradeAmount = null;
      try {
        const db = database.getDb();
        const setting = await new Promise((resolve, reject) => {
          db.get(
            'SELECT setting_value FROM compliance_settings WHERE setting_key = ?',
            ['max_trade_amount'],
            (err, row) => {
              if (err) reject(err);
              else resolve(row);
            }
          );
        });
        
        if (setting && setting.setting_value) {
          maxTradeAmount = parseFloat(setting.setting_value);
        }
      } catch (dbError) {
        console.warn('Could not fetch max trade amount from settings:', dbError.message);
      }

      // Calculate trade value for all orders (for storage purposes)
      const tradeCalculation = await stockService.calculateTradeValue(upperTicker, shares, maxTradeAmount);
      if (!tradeCalculation.success) {
        return res.status(400).json({
          success: false,
          message: `Error calculating trade value: ${tradeCalculation.error}`
        });
      }
      
      const isRestricted = await RestrictedStock.isRestricted(upperTicker);
      
      const requestData = {
        employee_email,
        stock_name: stockInfo.company_name,
        ticker: upperTicker,
        shares: parseInt(shares),
        share_price: tradeCalculation.current_price,
        total_value: tradeCalculation.total_value,
        currency: tradeCalculation.currency,
        share_price_usd: tradeCalculation.current_price_usd,
        total_value_usd: tradeCalculation.total_value_usd,
        exchange_rate: tradeCalculation.exchange_rate,
        trading_type: trading_type.toLowerCase()
      };

      const savedRequest = await TradingRequest.create(requestData);
      
      let status, rejectionReason = null;
      
      // Check various rejection criteria
      if (isRestricted) {
        status = 'rejected';
        rejectionReason = `${upperTicker} is on the restricted trading list`;
      } else if (trading_type.toLowerCase() === 'buy' && tradeCalculation && tradeCalculation.exceeds_max) {
        status = 'rejected';
        rejectionReason = `Purchase value ${tradeCalculation.formatted_total_usd} (${tradeCalculation.formatted_total}) exceeds maximum allowed amount of ${tradeCalculation.formatted_max}. Maximum shares allowed: ${tradeCalculation.max_shares_allowed}`;
      } else {
        status = 'approved';
      }
      
      await TradingRequest.updateStatus(savedRequest.id, status, rejectionReason);

      // Check if email notifications are enabled before sending
      let emailEnabled = true;
      try {
        const db = database.getDb();
        const emailSetting = await new Promise((resolve, reject) => {
          db.get(
            'SELECT setting_value FROM compliance_settings WHERE setting_key = ?',
            ['email_notifications_enabled'],
            (err, row) => {
              if (err) reject(err);
              else resolve(row);
            }
          );
        });
        
        if (emailSetting && emailSetting.setting_value) {
          emailEnabled = emailSetting.setting_value.toLowerCase() === 'true';
        }
      } catch (dbError) {
        console.warn('Could not fetch email notification setting:', dbError.message);
      }

      // Send email notification if enabled
      if (emailEnabled) {
        const emailRequestData = { ...requestData, id: savedRequest.id };
        await emailService.sendApprovalEmail(employee_email, emailRequestData, status, rejectionReason);
      }

      // Log the trading request submission
      await AuditLog.logActivity(
        employee_email,
        'employee',
        'create_trading_request',
        'trading_requests',
        savedRequest.id.toString(),
        JSON.stringify({ 
          ticker: upperTicker, 
          shares: requestData.shares, 
          trading_type: requestData.trading_type,
          status,
          rejection_reason: rejectionReason 
        }),
        req.ip,
        req.get('User-Agent'),
        req.sessionID
      );

      res.json({
        success: true,
        data: {
          id: savedRequest.id,
          status,
          message: status === 'approved' ? 
            'Request approved. You may proceed with the trade.' : 
            `Request rejected. ${rejectionReason}`
        }
      });

    } catch (error) {
      console.error('Submit request error:', error);
      res.status(500).json({ 
        success: false, 
        message: 'Internal server error' 
      });
    }
  }

  static async getRequests(req, res) {
    try {
      const requests = await TradingRequest.getAll();
      res.json({ success: true, data: requests });
    } catch (error) {
      console.error('Get requests error:', error);
      res.status(500).json({ 
        success: false, 
        message: 'Internal server error' 
      });
    }
  }

  static async getRequest(req, res) {
    try {
      const { id } = req.params;
      const request = await TradingRequest.getById(id);
      
      if (!request) {
        return res.status(404).json({ 
          success: false, 
          message: 'Request not found' 
        });
      }

      res.json({ success: true, data: request });
    } catch (error) {
      console.error('Get request error:', error);
      res.status(500).json({ 
        success: false, 
        message: 'Internal server error' 
      });
    }
  }
}

module.exports = TradingController;