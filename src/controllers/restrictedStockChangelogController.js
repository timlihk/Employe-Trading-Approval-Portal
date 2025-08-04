const RestrictedStockChangelog = require('../models/RestrictedStockChangelog');

class RestrictedStockChangelogController {
  static async getChangelog(req, res) {
    try {
      const changelog = await RestrictedStockChangelog.getAll();
      res.json({ success: true, data: changelog });
    } catch (error) {
      console.error('Get changelog error:', error);
      res.status(500).json({ 
        success: false, 
        message: 'Internal server error' 
      });
    }
  }

  static async getFilteredChangelog(req, res) {
    try {
      const filters = {};
      
      if (req.query.ticker) filters.ticker = req.query.ticker;
      if (req.query.action) filters.action = req.query.action;
      if (req.query.admin_email) filters.admin_email = req.query.admin_email;
      if (req.query.start_date) filters.start_date = req.query.start_date;
      if (req.query.end_date) filters.end_date = req.query.end_date;

      const changelog = await RestrictedStockChangelog.getFiltered(filters);
      const summary = await RestrictedStockChangelog.getSummary(filters);
      
      res.json({ 
        success: true, 
        data: changelog,
        summary: summary
      });
    } catch (error) {
      console.error('Get filtered changelog error:', error);
      res.status(500).json({ 
        success: false, 
        message: 'Internal server error' 
      });
    }
  }

  static async exportChangelog(req, res) {
    try {
      const filters = {};
      
      if (req.query.ticker) filters.ticker = req.query.ticker;
      if (req.query.action) filters.action = req.query.action;
      if (req.query.admin_email) filters.admin_email = req.query.admin_email;
      if (req.query.start_date) filters.start_date = req.query.start_date;
      if (req.query.end_date) filters.end_date = req.query.end_date;

      const changelog = await RestrictedStockChangelog.getFiltered(filters);
      
      // Create CSV content
      const headers = ['ID', 'Date', 'Time', 'Ticker', 'Company Name', 'Action', 'Admin Email', 'Reason', 'IP Address'];
      const csvRows = [headers.join(',')];
      
      changelog.forEach(entry => {
        const date = new Date(entry.created_at);
        const row = [
          entry.id,
          date.toISOString().split('T')[0],
          date.toTimeString().split(' ')[0],
          `"${entry.ticker}"`,
          `"${entry.company_name}"`,
          entry.action,
          `"${entry.admin_email}"`,
          `"${entry.reason || ''}"`,
          entry.ip_address || ''
        ];
        csvRows.push(row.join(','));
      });
      
      const csvContent = csvRows.join('\n');
      const filename = `restricted_stock_changelog_${new Date().toISOString().split('T')[0]}.csv`;
      
      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
      res.send(csvContent);
      
    } catch (error) {
      console.error('Export changelog error:', error);
      res.status(500).json({ 
        success: false, 
        message: 'Internal server error' 
      });
    }
  }
}

module.exports = RestrictedStockChangelogController;