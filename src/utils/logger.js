const winston = require('winston');

// Create logger instance
const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.errors({ stack: true }),
    winston.format.json(),
    winston.format.printf(({ timestamp, level, message, ...meta }) => {
      // Remove sensitive data from logs
      const sanitizedMeta = { ...meta };
      if (sanitizedMeta.req) {
        delete sanitizedMeta.req.body?.password;
        delete sanitizedMeta.req.body?.session;
        delete sanitizedMeta.req.headers?.authorization;
        delete sanitizedMeta.req.headers?.cookie;
      }
      return JSON.stringify({
        timestamp,
        level,
        message,
        ...sanitizedMeta
      });
    })
  ),
  defaultMeta: { service: 'trading-approval' },
  transports: [
    // Write all logs with level `error` and below to `error.log`
    new winston.transports.File({ filename: 'logs/error.log', level: 'error' }),
    // Write all logs with level `info` and below to `combined.log`
    new winston.transports.File({ filename: 'logs/combined.log' }),
  ],
});

// If we're not in production then log to the console with the format:
// `${info.level}: ${info.message} JSON.stringify({ ...rest }) `
if (process.env.NODE_ENV !== 'production') {
  logger.add(new winston.transports.Console({
    format: winston.format.combine(
      winston.format.colorize(),
      winston.format.simple()
    )
  }));
}

// Add request correlation ID middleware
const addRequestId = (req, res, next) => {
  req.id = Math.random().toString(36).substr(2, 9);
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