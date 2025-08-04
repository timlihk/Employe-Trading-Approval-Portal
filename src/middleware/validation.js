const { body } = require('express-validator');

const validateTradingRequest = [
  body('ticker')
    .trim()
    .isLength({ min: 1, max: 15 })
    .withMessage('Ticker must be between 1 and 15 characters')
    .matches(/^[A-Za-z0-9.-]+$/)
    .withMessage('Ticker must contain only letters, numbers, periods, and hyphens'),
  
  body('shares')
    .isInt({ min: 1, max: 1000000 })
    .withMessage('Shares must be a positive integer between 1 and 1,000,000'),
  
  body('trading_type')
    .isIn(['buy', 'sell'])
    .withMessage('Trading type must be either "buy" or "sell"')
];

const validateRestrictedStock = [
  body('ticker')
    .trim()
    .isLength({ min: 1, max: 15 })
    .withMessage('Ticker must be between 1 and 15 characters')
    .matches(/^[A-Za-z0-9.-]+$/)
    .withMessage('Ticker must contain only letters, numbers, periods, and hyphens'),
  
  body('company_name')
    .trim()
    .isLength({ min: 1, max: 200 })
    .withMessage('Company name must be between 1 and 200 characters'),
  
  body('exchange')
    .optional()
    .trim()
    .isLength({ max: 50 })
    .withMessage('Exchange must be less than 50 characters')
];

module.exports = {
  validateTradingRequest,
  validateRestrictedStock
};