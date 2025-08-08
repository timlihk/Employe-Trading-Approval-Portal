const winston = require('winston');
const fs = require('fs');
const path = require('path');

// Create logs directory if it doesn't exist (Railway-safe)
const logsDir = path.join(process.cwd(), 'logs');
try {
  if (!fs.existsSync(logsDir)) {
    fs.mkdirSync(logsDir, { recursive: true });
  }
} catch (error) {
  // If we can't create logs directory (Railway filesystem restrictions), use console only
  console.warn('Cannot create logs directory, using console logging only:', error.message);
}

// Create logger instance with Railway-safe transports
const transports = [];

// Always add console transport
transports.push(new winston.transports.Console({
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.colorize(),
    winston.format.simple()
  )
}));

// Only add file transports if logs directory is writable
try {
  if (fs.existsSync(logsDir)) {
    // Test if we can write to the logs directory
    const testFile = path.join(logsDir, '.test');
    fs.writeFileSync(testFile, 'test');
    fs.unlinkSync(testFile);
    
    // If successful, add file transports
    transports.push(new winston.transports.File({ 
      filename: path.join(logsDir, 'error.log'), 
      level: 'error' 
    }));
    transports.push(new winston.transports.File({ 
      filename: path.join(logsDir, 'combined.log') 
    }));
  }
} catch (error) {
  console.warn('Logs directory not writable, using console only:', error.message);
}

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
  transports: transports,
});

// Console transport is already configured above for all environments

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