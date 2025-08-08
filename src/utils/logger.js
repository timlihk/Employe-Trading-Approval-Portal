const winston = require('winston');
const fs = require('fs');
const path = require('path');

// Create logger instance (stdout-only for Railway)
const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.errors({ stack: true }),
    winston.format.json(),
    winston.format.printf(({ timestamp, level, message, ...meta }) => {
      // Remove sensitive/PII data from logs wholesale
      const sanitizedMeta = { ...meta };
      if (sanitizedMeta.req) {
        // Drop bodies and headers entirely rather than trying to selectively redact
        delete sanitizedMeta.req.body;
        delete sanitizedMeta.req.headers;
        delete sanitizedMeta.req.cookies;
        delete sanitizedMeta.req.session;
      }
      return JSON.stringify({ timestamp, level, message, ...sanitizedMeta });
    })
  ),
  defaultMeta: { service: 'trading-approval' },
  transports: [new winston.transports.Console()],
});

// Add request correlation ID middleware
const addRequestId = (req, res, next) => {
  const uuid = (typeof crypto !== 'undefined' && crypto.randomUUID) ? crypto.randomUUID() : require('crypto').randomUUID();
  req.id = uuid;
  res.setHeader('X-Request-ID', req.id);
  next();
};

// Log request middleware
const logRequest = (req, res, next) => {
  const start = Date.now();
  
  res.on('finish', () => {
    const duration = Date.now() - start;
    logger.info('HTTP Request', {
      requestId: req.id,
      method: req.method,
      url: req.originalUrl,
      status: res.statusCode,
      duration: `${duration}ms`,
      ip: req.ip,
      userAgent: req.get('user-agent')
    });
  });
  
  next();
};

// Security event logger
const logSecurityEvent = (event, details, req = null) => {
  logger.warn('Security Event', {
    event,
    details,
    requestId: req?.id,
    ip: req?.ip,
    userAgent: req?.get('user-agent'),
    timestamp: new Date().toISOString()
  });
};

module.exports = {
  logger,
  addRequestId,
  logRequest,
  logSecurityEvent
};