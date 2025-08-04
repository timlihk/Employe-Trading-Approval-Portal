const express = require('express');
const router = express.Router();
const { body, validationResult } = require('express-validator');
const { login, logout, checkAuth } = require('../middleware/auth');

const validateLogin = [
  body('username')
    .trim()
    .isLength({ min: 1 })
    .withMessage('Username is required'),
  
  body('password')
    .isLength({ min: 1 })
    .withMessage('Password is required')
];

const handleValidationErrors = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      success: false,
      message: 'Validation failed',
      errors: errors.array()
    });
  }
  next();
};

router.post('/login', validateLogin, handleValidationErrors, login);
router.post('/logout', logout);
router.get('/check', checkAuth);

module.exports = router;