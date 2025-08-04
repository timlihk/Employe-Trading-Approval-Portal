const { validationResult } = require('express-validator');
const RestrictedStock = require('../models/RestrictedStock');
const AuditLog = require('../models/AuditLog');
const RestrictedStockChangelog = require('../models/RestrictedStockChangelog');

class RestrictedStockController {
  static async getRestrictedStocks(req, res) {
    try {
      const stocks = await RestrictedStock.getAll();
      res.json({ success: true, data: stocks });
    } catch (error) {
      console.error('Get restricted stocks error:', error);
      res.status(500).json({ 
        success: false, 
        message: 'Internal server error' 
      });
    }
  }

  static async addRestrictedStock(req, res) {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ 
          success: false, 
          errors: errors.array() 
        });
      }

      const { ticker, company_name, exchange } = req.body;
      const result = await RestrictedStock.add(ticker, company_name, exchange);

      // Log the stock addition in audit log
      await AuditLog.logActivity(
        req.session.username || 'admin',
        'admin',
        'add_restricted_stock',
        'restricted_stocks',
        ticker,
        JSON.stringify({ ticker, company_name, exchange }),
        req.ip,
        req.get('User-Agent'),
        req.sessionID
      );

      // Log the change in restricted stock changelog
      await RestrictedStockChangelog.logChange({
        ticker,
        company_name,
        action: 'added',
        admin_email: req.session.username || 'admin',
        reason: 'Added via admin panel',
        ip_address: req.ip,
        user_agent: req.get('User-Agent'),
        session_id: req.sessionID
      });

      res.status(201).json({
        success: true,
        data: result,
        message: 'Stock added to restricted list'
      });
    } catch (error) {
      if (error.code === 'SQLITE_CONSTRAINT_UNIQUE') {
        return res.status(409).json({ 
          success: false, 
          message: 'Stock ticker already exists in restricted list' 
        });
      }
      
      console.error('Add restricted stock error:', error);
      res.status(500).json({ 
        success: false, 
        message: 'Internal server error' 
      });
    }
  }

  static async removeRestrictedStock(req, res) {
    try {
      const { ticker } = req.params;
      
      // Get stock info before removal for changelog
      const existingStock = await RestrictedStock.getByTicker(ticker);
      if (!existingStock) {
        return res.status(404).json({ 
          success: false, 
          message: 'Stock not found in restricted list' 
        });
      }

      const result = await RestrictedStock.remove(ticker);

      if (result.changes === 0) {
        return res.status(404).json({ 
          success: false, 
          message: 'Stock not found in restricted list' 
        });
      }

      // Log the stock removal in audit log
      await AuditLog.logActivity(
        req.session.username || 'admin',
        'admin',
        'remove_restricted_stock',
        'restricted_stocks',
        ticker,
        JSON.stringify({ ticker, company_name: existingStock.company_name, removed: true }),
        req.ip,
        req.get('User-Agent'),
        req.sessionID
      );

      // Log the change in restricted stock changelog
      await RestrictedStockChangelog.logChange({
        ticker,
        company_name: existingStock.company_name,
        action: 'removed',
        admin_email: req.session.username || 'admin',
        reason: 'Removed via admin panel',
        ip_address: req.ip,
        user_agent: req.get('User-Agent'),
        session_id: req.sessionID
      });

      res.json({
        success: true,
        message: 'Stock removed from restricted list'
      });
    } catch (error) {
      console.error('Remove restricted stock error:', error);
      res.status(500).json({ 
        success: false, 
        message: 'Internal server error' 
      });
    }
  }
}

module.exports = RestrictedStockController;