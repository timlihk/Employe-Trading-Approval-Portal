const rateLimit = require('express-rate-limit');
const { logSecurityEvent } = require('../utils/logger');

// General rate limiting
const generalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // limit each IP to 100 requests per windowMs
  message: {
    error: 'Too many requests from this IP, please try again later.',
    retryAfter: '15 minutes'
  },
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req, res) => {
    logSecurityEvent('RATE_LIMIT_EXCEEDED', { 
      limit: 'general',
      ip: req.ip 
    }, req);
    res.status(429).json({
      error: 'Too many requests from this IP, please try again later.',
      retryAfter: '15 minutes'
    });
  }
});

// Strict rate limiting for authentication endpoints
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5, // limit each IP to 5 auth attempts per windowMs
  message: {
    error: 'Too many authentication attempts, please try again later.',
    retryAfter: '15 minutes'
  },
  skipSuccessfulRequests: true,
  handler: (req, res) => {
    logSecurityEvent('AUTH_RATE_LIMIT_EXCEEDED', { 
      ip: req.ip,
      endpoint: req.path
    }, req);
    res.status(429).json({
      error: 'Too many authentication attempts, please try again later.',
      retryAfter: '15 minutes'
    });
  }
});

// Admin action rate limiting
const adminActionLimiter = rateLimit({
  windowMs: 5 * 60 * 1000, // 5 minutes
  max: 50, // limit admin actions
  message: {
    error: 'Too many admin actions, please slow down.',
    retryAfter: '5 minutes'
  },
  handler: (req, res) => {
    logSecurityEvent('ADMIN_RATE_LIMIT_EXCEEDED', { 
      ip: req.ip,
      admin: req.session?.admin?.username,
      endpoint: req.path
    }, req);
    res.status(429).json({
      error: 'Too many admin actions, please slow down.',
      retryAfter: '5 minutes'
    });
  }
});

module.exports = {
  generalLimiter,
  authLimiter,
  adminActionLimiter
};