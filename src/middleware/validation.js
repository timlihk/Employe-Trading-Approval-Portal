const { body, param, query, validationResult } = require('express-validator');
const { logSecurityEvent } = require('../utils/logger');

// Validation error handler
const handleValidationErrors = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    logSecurityEvent('VALIDATION_FAILED', {
      errors: errors.array(),
      body: req.body,
      params: req.params,
      query: req.query
    }, req);
    
    // For web form submissions (not API calls), redirect with user-friendly error
    if (req.path === '/preview-trade' || req.path === '/submit-trade') {
      const firstError = errors.array()[0];
      let errorMessage = '';
      
      if (firstError.path === 'ticker') {
        const ticker = req.body.ticker || '';
        errorMessage = `Invalid ticker format: "${ticker}". Please use only letters, numbers, dots, and hyphens (e.g., AAPL, 0700.HK, BARC.L)`;
      } else if (firstError.path === 'shares') {
        errorMessage = 'Invalid number of shares. Please enter a number between 1 and 1,000,000';
      } else if (firstError.path === 'trading_type') {
        errorMessage = 'Invalid trading type. Please select either BUY or SELL';
      } else {
        errorMessage = firstError.msg || 'Invalid input. Please check your form and try again';
      }
      
      // Preserve form data in query params for re-population
      const queryParams = new URLSearchParams({
        error: errorMessage,
        ticker: req.body.ticker || '',
        shares: req.body.shares || '',
        trading_type: req.body.trading_type || 'buy'
      });
      
      return res.redirect(`/employee-dashboard?${queryParams.toString()}`);
    }
    
    // For escalation form submissions
    if (req.path.includes('/submit-escalation')) {
      const firstError = errors.array()[0];
      const errorMessage = firstError.path === 'escalation_reason' 
        ? 'Escalation reason must be between 10 and 1000 characters. Please provide more detail.'
        : firstError.msg || 'Invalid input. Please check your form and try again';
      
      return res.redirect(`/employee-history?error=${encodeURIComponent(errorMessage)}`);
    }
    
    // For admin authentication
    if (req.path === '/admin-authenticate') {
      const firstError = errors.array()[0];
      let errorMessage = 'Invalid credentials. Please try again.';
      
      if (firstError.path === 'username') {
        errorMessage = 'Invalid username format. Please use only letters, numbers, and basic symbols.';
      }
      
      return res.redirect(`/admin?error=${encodeURIComponent(errorMessage)}`);
    }
    
    // For API calls, return JSON as before
    return res.status(400).json({
      error: 'Validation failed',
      details: errors.array().map(err => ({
        field: err.path,
        message: err.msg,
        value: err.value
      }))
    });
  }
  next();
};

// Admin authentication validation
const validateAdminAuth = [
  body('username')
    .trim()
    .isLength({ min: 1, max: 100 })
    .matches(/^[a-zA-Z0-9._@-]+$/)
    .withMessage('Username contains invalid characters'),
  body('password')
    .isLength({ min: 1, max: 200 })
    .withMessage('Password is required'),
  handleValidationErrors
];

// Trading request validation
const validateTradingRequest = [
  body('ticker')
    .trim()
    .isLength({ min: 1, max: 15 })
    .matches(/^[A-Za-z0-9.-]+$/)
    .withMessage('Invalid ticker format')
    .customSanitizer(value => value.toUpperCase()),
  body('shares')
    .isInt({ min: 1, max: 1000000 })
    .withMessage('Shares must be between 1 and 1,000,000'),
  body('trading_type')
    .isIn(['buy', 'sell'])
    .withMessage('Trading type must be buy or sell'),
  handleValidationErrors
];

// Stock ticker validation
const validateStockTicker = [
  body('ticker')
    .trim()
    .isLength({ min: 1, max: 15 })
    .matches(/^[A-Za-z0-9.-]+$/)
    .withMessage('Invalid ticker format')
    .customSanitizer(value => value.toUpperCase()),
  handleValidationErrors
];

// Request ID validation
const validateRequestId = [
  body('requestId')
    .isInt({ min: 1 })
    .withMessage('Invalid request ID'),
  handleValidationErrors
];

// Escalation validation
const validateEscalation = [
  body('escalation_reason')
    .trim()
    .isLength({ min: 10, max: 1000 })
    .withMessage('Escalation reason must be between 10 and 1000 characters'),
  handleValidationErrors
];

// Email validation for employee authentication
const validateEmployeeEmail = [
  body('email')
    .isEmail()
    .normalizeEmail()
    .isLength({ max: 255 })
    .withMessage('Valid email is required'),
  handleValidationErrors
];

// Date range validation
const validateDateRange = [
  query('start_date')
    .optional()
    .isDate()
    .withMessage('Invalid start date'),
  query('end_date')
    .optional()
    .isDate()
    .withMessage('Invalid end date'),
  query('start_date').custom((value, { req }) => {
    if (value && req.query.end_date) {
      if (new Date(value) > new Date(req.query.end_date)) {
        throw new Error('Start date must be before end date');
      }
    }
    return true;
  }),
  handleValidationErrors
];

// Parameter validation
const validateRequestParam = [
  param('requestId')
    .isInt({ min: 1 })
    .withMessage('Invalid request ID parameter'),
  handleValidationErrors
];

module.exports = {
  validateAdminAuth,
  validateTradingRequest,
  validateStockTicker,
  validateRequestId,
  validateEscalation,
  validateEmployeeEmail,
  validateDateRange,
  validateRequestParam,
  handleValidationErrors
};