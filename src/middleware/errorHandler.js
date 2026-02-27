const { logger } = require('../utils/logger');
const { trackError } = require('../utils/metrics');
const APP_VERSION = require('../../package.json').version || '0';

// Custom error class for operational errors
class AppError extends Error {
  constructor(message, statusCode, isOperational = true) {
    super(message);
    this.statusCode = statusCode;
    this.status = `${statusCode}`.startsWith('4') ? 'fail' : 'error';
    this.isOperational = isOperational;

    Error.captureStackTrace(this, this.constructor);
  }
}

// Development error response
const sendErrorDev = (err, req, res) => {
  logger.error('Development Error', {
    requestId: req.id,
    error: err.message,
    stack: err.stack,
    originalUrl: req.originalUrl,
    method: req.method,
    ip: req.ip
  });

  if (req.accepts('json') && !req.accepts('html')) {
    return res.status(err.statusCode || 500).json({
      status: err.status,
      error: err,
      message: err.message,
      stack: err.stack
    });
  }

  // Return HTML error page for web requests
  res.status(err.statusCode || 500).send(`
    <!DOCTYPE html>
    <html lang="en">
    <head>
        <meta charset="UTF-8">
        <title>Error - Trading Compliance Portal</title>
        <style>
          body { font-family: Arial, sans-serif; max-width: 800px; margin: 50px auto; padding: 20px; }
          .error { background: #f8d7da; border: 1px solid #f5c6cb; padding: 20px; border-radius: 5px; }
          pre { background: #f8f9fa; padding: 15px; border-radius: 3px; overflow-x: auto; }
        </style>
    </head>
    <body>
        <h1>Development Error</h1>
        <div class="error">
            <h3>${err.message}</h3>
            <p><strong>Status:</strong> ${err.statusCode || 500}</p>
            <p><strong>Request ID:</strong> ${req.id}</p>
        </div>
        <h3>Stack Trace:</h3>
        <pre>${err.stack}</pre>
        <p><a href="/">← Back to Home</a></p>
    </body>
    </html>
  `);
};

// Production error response
const sendErrorProd = (err, req, res) => {
  logger.error('Production Error', {
    requestId: req.id,
    error: err.message,
    stack: err.stack,
    originalUrl: req.originalUrl,
    method: req.method,
    ip: req.ip,
    userAgent: req.get('user-agent')
  });

  // Operational, trusted error: send message to client
  if (err.isOperational) {
    if (req.accepts('json') && !req.accepts('html')) {
      return res.status(err.statusCode).json({
        status: err.status,
        message: err.message
      });
    }

    return res.status(err.statusCode).send(`
      <!DOCTYPE html>
      <html lang="en">
      <head>
          <meta charset="UTF-8">
          <title>Error - Trading Compliance Portal</title>
          <link rel="stylesheet" href="/styles-modern.min.css?v=${APP_VERSION}">
      </head>
      <body>
          <div class="container">
              <div style="text-align: center; margin-top: 100px;">
                  <h1>Oops! Something went wrong</h1>
                  <div class="card" style="max-width: 500px; margin: 20px auto;">
                      <div class="card-body">
                          <p>${err.message}</p>
                          <p>Request ID: <code>${req.id}</code></p>
                          <a href="/" class="btn btn-primary">← Back to Home</a>
                      </div>
                  </div>
              </div>
          </div>
      </body>
      </html>
    `);
  }

  // Programming or other unknown error: don't leak error details
  if (req.accepts('json') && !req.accepts('html')) {
    return res.status(500).json({
      status: 'error',
      message: 'Something went wrong! Please try again later.'
    });
  }

  res.status(500).send(`
    <!DOCTYPE html>
    <html lang="en">
    <head>
        <meta charset="UTF-8">
        <title>Error - Trading Compliance Portal</title>
        <link rel="stylesheet" href="/styles-modern.min.css?v=${APP_VERSION}">
    </head>
    <body>
        <div class="container">
            <div style="text-align: center; margin-top: 100px;">
                <h1>Internal Server Error</h1>
                <div class="card" style="max-width: 500px; margin: 20px auto;">
                    <div class="card-body">
                        <p>Something went wrong! Please try again later.</p>
                        <p>If the problem persists, please contact support.</p>
                        <p>Request ID: <code>${req.id}</code></p>
                        <a href="/" class="btn btn-primary">← Back to Home</a>
                    </div>
                </div>
            </div>
        </div>
    </body>
    </html>
  `);
};

// Main error handling middleware
const globalErrorHandler = (err, req, res, _next) => {
  err.statusCode = err.statusCode || 500;
  err.status = err.status || 'error';

  trackError(err, req.path);

  if (process.env.NODE_ENV === 'development') {
    sendErrorDev(err, req, res);
  } else {
    sendErrorProd(err, req, res);
  }
};

// Async error wrapper to catch async errors
const catchAsync = (fn) => {
  return (req, res, next) => {
    fn(req, res, next).catch(next);
  };
};

// Handle unhandled routes
const handleNotFound = (req, res, next) => {
  const err = new AppError(`Can't find ${req.originalUrl} on this server!`, 404);
  next(err);
};

module.exports = {
  AppError,
  globalErrorHandler,
  catchAsync,
  handleNotFound
};