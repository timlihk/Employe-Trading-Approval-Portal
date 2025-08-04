const express = require('express');
const router = express.Router();
const AuditController = require('../controllers/auditController');

// Middleware to check admin authentication
const requireAdmin = (req, res, next) => {
  if (!req.session.adminLoggedIn) {
    return res.status(401).json({ success: false, message: 'Admin authentication required' });
  }
  next();
};

// Get audit logs with filtering
router.get('/logs', requireAdmin, AuditController.getAuditLogs);

// Generate compliance reports
router.get('/compliance-report', requireAdmin, AuditController.getComplianceReport);

// Get compliance settings
router.get('/compliance-settings', requireAdmin, AuditController.getComplianceSettings);

// Update compliance settings
router.post('/compliance-settings', requireAdmin, AuditController.updateComplianceSetting);

// Perform data retention cleanup
router.post('/cleanup', requireAdmin, AuditController.performDataRetentionCleanup);

// Export compliance reports
router.get('/export', requireAdmin, AuditController.exportComplianceReport);

module.exports = router;