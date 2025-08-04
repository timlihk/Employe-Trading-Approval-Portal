const TradingRequest = require('../models/TradingRequest');

class InquiryController {
  static async getTeamMembers(req, res) {
    try {
      const teamMembers = await TradingRequest.getUniqueTeamMembers();
      res.json({ success: true, data: teamMembers });
    } catch (error) {
      console.error('Get team members error:', error);
      res.status(500).json({ 
        success: false, 
        message: 'Internal server error' 
      });
    }
  }

  static async getSubmissionHistory(req, res) {
    try {
      const { employee_email, start_date, end_date } = req.query;
      
      const filters = {};
      if (employee_email && employee_email !== 'all') {
        filters.employee_email = employee_email.toLowerCase();
      }
      if (start_date) {
        filters.start_date = start_date;
      }
      if (end_date) {
        filters.end_date = end_date;
      }

      const history = await TradingRequest.getFilteredHistory(filters);
      const summary = await TradingRequest.getHistorySummary(filters);
      
      // Check if CSV export is requested
      if (req.query.format === 'csv') {
        const csv = this.convertToCSV(history, [
          'id', 'employee_email', 'stock_name', 'ticker', 'shares', 
          'share_price', 'total_value', 'currency', 'trading_type', 
          'status', 'rejection_reason', 'created_at', 'processed_at'
        ]);
        
        res.setHeader('Content-Type', 'text/csv');
        res.setHeader('Content-Disposition', 'attachment; filename="trading_history.csv"');
        res.send(csv);
        return;
      }

      res.json({ 
        success: true, 
        data: {
          history,
          summary
        }
      });
    } catch (error) {
      console.error('Get submission history error:', error);
      res.status(500).json({ 
        success: false, 
        message: 'Internal server error' 
      });
    }
  }

  static convertToCSV(data, headers) {
    if (!data || data.length === 0) return '';
    
    const csvHeaders = headers.join(',');
    const csvRows = data.map(row => 
      headers.map(header => {
        let value = row[header];
        if (value === null || value === undefined) value = '';
        
        // Format specific fields
        if (header === 'share_price' && value) {
          value = parseFloat(value).toFixed(2);
        }
        if (header === 'total_value' && value) {
          value = parseFloat(value).toLocaleString();
        }
        if (header === 'created_at' || header === 'processed_at') {
          value = value ? new Date(value).toLocaleString() : '';
        }
        
        // Escape commas and quotes in CSV
        if (typeof value === 'string' && (value.includes(',') || value.includes('"'))) {
          return `"${value.replace(/"/g, '""')}"`;
        }
        return value || '';
      }).join(',')
    );
    
    return [csvHeaders, ...csvRows].join('\n');
  }
}

module.exports = InquiryController;