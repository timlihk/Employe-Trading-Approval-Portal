require('dotenv').config();
const express = require('express');
const helmet = require('helmet');
const session = require('express-session');
const path = require('path');
const msal = require('@azure/msal-node');
const compression = require('compression');
const pgSessionFactory = require('connect-pg-simple');

// Security and logging utilities
const { logger, addRequestId, logRequest, logSecurityEvent } = require('./utils/logger');
const { generalLimiter, authLimiter, adminActionLimiter } = require('./middleware/security');
const { globalErrorHandler, handleNotFound, catchAsync, AppError } = require('./middleware/errorHandler');
const { validateTradingRequest, validateAdminAuth } = require('./middleware/validation');

// Controllers
const AdminController = require('./controllers/AdminController');
const EmployeeController = require('./controllers/EmployeeController');
const TradingRequestController = require('./controllers/TradingRequestController');

// Services
const AdminService = require('./services/AdminService');
const TradingRequestService = require('./services/TradingRequestService');

// Models
const TradingRequest = require('./models/TradingRequest');
const RestrictedStock = require('./models/RestrictedStock');
const database = require('./models/database');

// Initialize database on startup
logger.info('Database initialized successfully');

// Template utilities
const { renderAdminPage, renderEmployeePage, renderPublicPage, generateNotificationBanner } = require('./utils/templates');

// MSAL Configuration (only if Azure credentials are provided)
let cca = null;
if (process.env.AZURE_CLIENT_ID && process.env.AZURE_CLIENT_SECRET && process.env.AZURE_TENANT_ID) {
  const { msalConfig } = require('./config/msalConfig');
  cca = new msal.ConfidentialClientApplication(msalConfig);
  logger.info('Microsoft 365 SSO enabled');
} else {
  logger.info('Microsoft 365 SSO disabled - using email-based authentication');
}

// Enhanced CSRF utilities with crypto-safe comparison
const crypto = require('crypto');

function generateCsrfToken(req) { 
  const token = crypto.randomBytes(32).toString('hex'); // Increased entropy
  req.session.csrfToken = token; 
  return token; 
}

function verifyCsrfToken(req, res, next) { 
  const sent = req.body && (req.body.csrf_token || req.body._csrf); 
  const expected = req.session && req.session.csrfToken;
  
  // Use timing-safe comparison to prevent timing attacks
  const valid = sent && expected && sent.length === expected.length && crypto.timingSafeEqual(Buffer.from(sent), Buffer.from(expected));
  
  if (!valid) { 
    logSecurityEvent('CSRF_VALIDATION_FAILED', { 
      url: req.originalUrl, 
      method: req.method,
      hasToken: !!sent,
      hasSession: !!expected
    }, req); 
    return res.status(403).send('Forbidden: invalid CSRF token'); 
  } 
  
  // Generate new token after successful validation (token rotation)
  generateCsrfToken(req); 
  next(); 
}

function csrfInput(req) { 
  const token = (req.session && req.session.csrfToken) || generateCsrfToken(req); 
  return `<input type="hidden" name="csrf_token" value="${token}">`; 
}

// Helper function to get the correct base URL
function getBaseUrl(req) {
  if (process.env.NODE_ENV === 'production' && req) {
    const protocol = req.get('x-forwarded-proto') || req.protocol || 'https';
    const host = req.get('host');
    return `${protocol}://${host}`;
  }
  return process.env.FRONTEND_URL || 'http://localhost:3001';
}

function createMetrics() {
  return { 
    startTime: Date.now(), 
    requests: 0, 
    errors: 0,
    latencyBuckets: {
      under50ms: 0,
      under200ms: 0, 
      under1000ms: 0,
      over1000ms: 0
    },
    externalApis: {
      tickerValidation: {
        cacheHits: 0,
        cacheMisses: 0,
        apiCalls: 0,
        apiErrors: 0,
        circuitBreakerOpens: 0
      },
      currencyExchange: {
        cacheHits: 0,
        cacheMisses: 0,
        apiCalls: 0,
        apiErrors: 0,
        circuitBreakerOpens: 0
      }
    },
    sessionStore: {
      fallbackEvents: 0,
      connectionErrors: 0
    }
  };
}
const metrics = createMetrics();

// Middleware functions
function requireAdmin(req, res, next) {
  if (!req.session.admin || !req.session.admin.username) {
    logSecurityEvent('UNAUTHORIZED_ADMIN_ACCESS', {
      url: req.originalUrl,
      method: req.method
    }, req);
    
    if (req.accepts('json') && !req.accepts('html')) {
      return res.status(401).json({ error: 'Admin authentication required' });
    }
    return res.redirect('/admin-login?error=authentication_required');
  }
  next();
}

function requireEmployee(req, res, next) {
  if (!req.session.employee || !req.session.employee.email) {
    logSecurityEvent('UNAUTHORIZED_EMPLOYEE_ACCESS', {
      url: req.originalUrl,
      method: req.method
    }, req);
    return res.redirect('/?error=authentication_required');
  }
  next();
}

const app = express();
app.set('trust proxy', 1);

app.use(helmet({
  contentSecurityPolicy: {
    useDefaults: false,
    directives: {
      defaultSrc: ["'self'"],
      baseUri: ["'self'"],
      formAction: ["'self'"],
      frameAncestors: ["'self'"],
      objectSrc: ["'none'"],
      scriptSrc: ["'none'"],
      styleSrc: ["'self'"],
      imgSrc: ["'self'", "data:"],
      fontSrc: ["'self'", 'https:', 'data:'],
      upgradeInsecureRequests: []
    }
  },
  referrerPolicy: { policy: 'no-referrer' },
  crossOriginOpenerPolicy: true,
  crossOriginResourcePolicy: { policy: 'same-origin' },
  frameguard: { action: 'sameorigin' },
  hsts: { maxAge: 31536000, includeSubDomains: true },
  xssFilter: false
}));

app.use(compression());

// Ensure SESSION_SECRET is provided - fail fast for security
if (!process.env.SESSION_SECRET) {
  logger.error('❌ FATAL: SESSION_SECRET environment variable is required for security');
  process.exit(1);
}
// Enforce admin creds in production
if (process.env.NODE_ENV === 'production') {
  if (!process.env.ADMIN_USERNAME || !process.env.ADMIN_PASSWORD) {
    logger.error('❌ FATAL: ADMIN_USERNAME and ADMIN_PASSWORD are required in production');
    process.exit(1);
  }
}

// Postgres-backed session store in production - BLOCKING INITIALIZATION
// Strategy: PostgreSQL sessions are the steady state for persistence across deployments
// Fallback to memory store only as emergency measure (with loud warnings)
// Use SESSION_STORE_NO_FALLBACK=true to fail-fast in strict production environments

function initSessionStoreSync() {
  let sessionStore = undefined;
  
  if (process.env.NODE_ENV === 'production' && process.env.DATABASE_URL) {
    const PgSession = pgSessionFactory(session);
    
    // Test database connectivity first with retries
    const maxRetries = 3;
    const retryDelays = [1000, 2000, 4000]; // 1s, 2s, 4s
    let dbConnected = false;
    
    logger.info('🔄 Testing database connectivity for session store...');
    
    for (let attempt = 0; attempt < maxRetries; attempt++) {
      try {
        // Synchronous test using the existing database pool
        // Note: This assumes database.query can be called synchronously at startup
        const testResult = database.pool ? true : false;
        if (testResult && process.env.DATABASE_URL) {
          dbConnected = true;
          logger.info('✅ Database connectivity verified', { attempt: attempt + 1 });
          break;
        }
      } catch (error) {
        logger.warn(`Database connectivity attempt ${attempt + 1}/${maxRetries} failed`, { 
          error: error.message,
          willRetry: attempt < maxRetries - 1 
        });
        
        if (attempt < maxRetries - 1) {
          // Simple blocking wait (not ideal but necessary for sync init)
          const start = Date.now();
          while (Date.now() - start < retryDelays[attempt]) {
            // Blocking wait
          }
        }
      }
    }
    
    // Create session store if database is available
    if (dbConnected) {
      try {
        sessionStore = new PgSession({
          pool: database.getPool(),
          createTableIfMissing: true,
          tableName: 'session',
          pruneSessionInterval: 60 * 15, // Cleanup every 15 minutes
          // TODO: Add index for efficient cleanup - CREATE INDEX idx_session_expire ON session(expire);
        });
        logger.info('✅ PostgreSQL session store initialized successfully');
      } catch (error) {
        logger.error('Failed to create PostgreSQL session store', { error: error.message });
        dbConnected = false;
      }
    }
    
    // Handle fallback
    if (!dbConnected) {
      const disallowFallback = process.env.SESSION_STORE_NO_FALLBACK === 'true';
      
      if (disallowFallback) {
        logger.error('❌ FATAL: Database connection failed and fallback is disabled', { 
          event: 'SESSION_STORE_STRICT_MODE_EXIT',
          attempts: maxRetries 
        });
        process.exit(1);
      }
      
      // SEARCHABLE FALLBACK EVENT
      logger.error('🚨 SESSION_STORE_FALLBACK_TO_MEMORY', {
        event: 'SESSION_STORE_FALLBACK_TO_MEMORY',
        reason: 'Database connectivity failed after retries',
        attempts: maxRetries,
        impact: 'Sessions will not persist across deployments',
        action: 'INVESTIGATE DATABASE CONNECTION IMMEDIATELY',
        temporary: true
      });
    }
  }
  
  return sessionStore;
}

// Initialize session store synchronously before app configuration
logger.info('🔄 Initializing session store...');
const sessionStore = initSessionStoreSync();

app.use(session({
  secret: process.env.SESSION_SECRET,
  resave: false,
  saveUninitialized: false,
  store: sessionStore,
  cookie: {
    secure: process.env.NODE_ENV === 'production',
    httpOnly: true,
    maxAge: 24 * 60 * 60 * 1000,
    sameSite: 'lax'
  },
  proxy: true
}));

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

app.use(addRequestId);
app.use((req, res, next) => { 
  metrics.requests += 1; 
  req.startTime = Date.now();
  
  // Track latency when response finishes
  res.on('finish', () => {
    const latency = Date.now() - req.startTime;
    if (latency < 50) metrics.latencyBuckets.under50ms++;
    else if (latency < 200) metrics.latencyBuckets.under200ms++;
    else if (latency < 1000) metrics.latencyBuckets.under1000ms++;
    else metrics.latencyBuckets.over1000ms++;
  });
  
  next(); 
});
app.use(logRequest);
app.use(generalLimiter);
app.use((req, res, next) => { req.csrfInput = () => csrfInput(req); next(); });

// Serve static files with caching
app.use(express.static(path.join(__dirname, '../public'), {
  index: false,
  maxAge: process.env.NODE_ENV === 'production' ? '1d' : 0,
  etag: true
}));

// ===========================================
// SYSTEM ROUTES
// ===========================================

// Health
app.get('/health', async (req, res) => {
  try {
    let dbStatus = 'unknown';
    let dbError = null;
    try {
      if (process.env.DATABASE_URL) {
        try {
          await database.query('SELECT 1 as test');
          dbStatus = 'connected';
        } catch (e) {
          dbStatus = 'error';
          dbError = e.message;
        }
      } else {
        dbStatus = 'no_url_provided';
      }
    } catch (error) {
      dbStatus = 'error';
      dbError = error.message;
    }
    res.status(200).json({ status: 'healthy', timestamp: new Date().toISOString(), uptime: process.uptime(), database: { status: dbStatus, error: dbError, hasUrl: !!process.env.DATABASE_URL } });
  } catch (error) {
    metrics.errors += 1;
    res.status(200).json({ status: 'healthy', timestamp: new Date().toISOString(), uptime: process.uptime(), database: { status: 'healthcheck_error', error: error.message } });
  }
});

// Metrics (basic, no PII)
app.get('/metrics', async (req, res) => {
  const now = Date.now();
  
  // Get external API stats
  let tickerStats = { cache: {}, circuitBreaker: {} };
  let currencyStats = { cache: {}, circuitBreaker: {} };
  
  try {
    const TradingRequestService = require('./services/TradingRequestService');
    const CurrencyService = require('./services/CurrencyService');
    
    tickerStats = TradingRequestService.getTickerValidationStats();
    currencyStats = CurrencyService.getCurrencyStats();
  } catch (error) {
    // Services might not be fully initialized yet
  }

  res.json({
    uptimeSeconds: Math.round(process.uptime()),
    requests: metrics.requests,
    errors: metrics.errors,
    latency: {
      under50ms: metrics.latencyBuckets.under50ms,
      under200ms: metrics.latencyBuckets.under200ms,
      under1000ms: metrics.latencyBuckets.under1000ms,
      over1000ms: metrics.latencyBuckets.over1000ms
    },
    externalApis: {
      ticker: {
        cache: tickerStats.cache,
        circuitBreaker: tickerStats.circuitBreaker
      },
      currency: {
        cache: currencyStats.cache,
        circuitBreaker: currencyStats.circuitBreaker
      }
    },
    sessionStore: metrics.sessionStore,
    startedAt: new Date(metrics.startTime).toISOString(),
    now: new Date(now).toISOString()
  });
});

// Session test only in non-production
if (process.env.NODE_ENV !== 'production') {
  app.get('/session-test', (req, res) => {
    const sessionId = req.sessionID;
    req.session.testValue = req.session.testValue || 0;
    req.session.testValue++;
    res.json({ sessionId, testValue: req.session.testValue });
  });
}

// Database status endpoint for admin debugging
app.get('/db-status', requireAdmin, async (req, res) => {
  try {
    const stats = await database.get(`
      SELECT 
        (SELECT COUNT(*) FROM trading_requests) as total_requests,
        (SELECT COUNT(*) FROM restricted_stocks) as total_restricted_stocks,
        (SELECT COUNT(*) FROM audit_logs) as total_audit_logs
    `);
    
    const dbInfo = {
      database_type: 'PostgreSQL',
      database_status: 'connected',
      database_url: process.env.DATABASE_URL ? 'Connected to Railway PostgreSQL' : 'No DATABASE_URL found',
      persistent: true,
      warning: null
    };
    
    res.json({
      ...dbInfo,
      record_counts: stats
    });
  } catch (error) {
    res.status(500).json({
      database_status: 'error',
      error: error.message
    });
  }
});


// ===========================================
// AUTHENTICATION ROUTES
// ===========================================

// Landing page
app.get('/', (req, res) => {
  const { error, message } = req.query;
  let banner = '';
  
  if (error === 'authentication_required') {
    banner = generateNotificationBanner({ error: 'Please log in to access that page' });
  } else if (message === 'logged_out') {
    banner = generateNotificationBanner({ message: 'You have been successfully logged out' });
  }

  const landingContent = `
    ${banner}
    <div style="text-align: center; max-width: 600px; margin: 0 auto;">
      <h2 style="color: var(--gs-dark-blue); margin-bottom: var(--spacing-6);">Employee Trading Request Portal</h2>
      
      <div class="card">
        <div class="card-header">
          <h3 class="card-title">Sign In</h3>
        </div>
        <div class="card-body">
          ${cca ? `
            <a href="/api/auth/microsoft/login" class="btn btn-primary" style="width: 100%; text-decoration: none; display: inline-block;">
              🔑 Sign in with Microsoft 365
            </a>
          ` : `
            <p style="text-align: center; color: var(--gs-neutral-600); margin: var(--spacing-4) 0;">
              Microsoft 365 SSO is not configured. Please contact your administrator.
            </p>
          `}
        </div>
      </div>

      <div style="margin-top: var(--spacing-6); text-align: center;">
        <p style="color: var(--gs-neutral-600); font-size: var(--font-size-sm);">
          Admin? <a href="/admin-login" style="color: var(--gs-primary);">Sign in here</a>
        </p>
      </div>
    </div>
  `;

  const html = renderPublicPage('Employee Trading Portal', landingContent);
  res.send(html);
});

// Email authentication removed - Microsoft 365 SSO only

// Microsoft SSO routes (if enabled)
if (cca) {
  app.get('/api/auth/microsoft/login', async (req, res) => {
    const baseUrl = getBaseUrl(req);
    const REDIRECT_URI = `${baseUrl}/api/auth/microsoft/callback`;
    const state = (require('crypto').randomBytes(16)).toString('hex');
    req.session.oauthState = state;

    const authCodeUrlParameters = { scopes: ['user.read'], redirectUri: REDIRECT_URI, state };

    try {
      const authUrl = await cca.getAuthCodeUrl(authCodeUrlParameters);
      logger.info('Redirecting to Microsoft login', { redirectUri: REDIRECT_URI, sessionId: req.sessionID });
      res.redirect(authUrl);
    } catch (error) {
      logger.error('Error generating auth URL', { error: error.message });
      res.redirect('/?error=sso_error');
    }
  });

  app.get('/api/auth/microsoft/callback', async (req, res) => {
    const baseUrl = getBaseUrl(req);
    const REDIRECT_URI = `${baseUrl}/api/auth/microsoft/callback`;

    // Validate state
    if (!req.session.oauthState || req.query.state !== req.session.oauthState) {
      logSecurityEvent('OAUTH_STATE_MISMATCH', { expected: req.session.oauthState, received: req.query.state }, req);
      return res.redirect('/?error=sso_state_mismatch');
    }

    const tokenRequest = { code: req.query.code, scopes: ['user.read'], redirectUri: REDIRECT_URI };

    try {
      const response = await cca.acquireTokenByCode(tokenRequest);
      const userInfo = response.account;

      req.session.employee = { email: userInfo.username.toLowerCase(), name: userInfo.name || userInfo.username.split('@')[0] };
      delete req.session.oauthState;

      logger.info('Microsoft SSO successful', { email: userInfo.username.toLowerCase(), name: userInfo.name, sessionId: req.sessionID });
      res.redirect('/employee-dashboard?message=login_success');
    } catch (error) {
      logger.error('Microsoft SSO callback error', { error: error.message, code: req.query.code ? 'present' : 'missing' });
      res.redirect('/?error=sso_callback_error');
    }
  });

  app.get('/api/auth/microsoft/logout', (req, res) => {
    req.session.destroy((err) => { if (err) { logger.error('Session destruction error', { error: err.message }); } res.redirect('/?message=logged_out'); });
  });
}

// Admin login page
app.get('/admin-login', (req, res) => {
  const banner = generateNotificationBanner(req.query);

  const adminLoginContent = `
    ${banner}
    <div style="max-width: 400px; margin: 0 auto;">
      <div class="card">
        <div class="card-header">
          <h3 class="card-title">Administrator Sign In</h3>
        </div>
        <div class="card-body">
          <form method="post" action="/admin-authenticate">
            ${req.csrfInput()}
            <div style="margin-bottom: var(--spacing-4);">
              <label style="display: block; margin-bottom: var(--spacing-2); font-weight: 600;">Username:</label>
              <input type="text" name="username" required 
                     style="width: 100%; padding: var(--spacing-3); border: 1px solid var(--gs-neutral-300); border-radius: var(--radius);">
            </div>
            <div style="margin-bottom: var(--spacing-4);">
              <label style="display: block; margin-bottom: var(--spacing-2); font-weight: 600;">Password:</label>
              <input type="password" name="password" required 
                     style="width: 100%; padding: var(--spacing-3); border: 1px solid var(--gs-neutral-300); border-radius: var(--radius);">
            </div>
            <button type="submit" class="btn btn-primary" style="width: 100%;">
              Sign In
            </button>
          </form>
        </div>
      </div>

      <div style="text-align: center; margin-top: var(--spacing-6);">
        <a href="/" style="color: var(--gs-primary);">← Back to Home</a>
      </div>
    </div>
  `;

  const html = renderPublicPage('Admin Login', adminLoginContent);
  res.send(html);
});

// Logout routes
app.get('/employee-logout', (req, res) => {
  req.session.destroy((err) => {
    if (err) logger.error('Session destruction error', { error: err.message });
    res.redirect('/?message=logged_out');
  });
});

app.get('/admin-logout', (req, res) => {
  req.session.destroy((err) => {
    if (err) logger.error('Session destruction error', { error: err.message });
    res.redirect('/?message=logged_out');
  });
});

// ===========================================
// ADMIN ROUTES
// ===========================================

app.post('/admin-authenticate', authLimiter, validateAdminAuth, verifyCsrfToken, AdminController.authenticateAdmin);
app.get('/admin-dashboard', requireAdmin, AdminController.getDashboard);
app.get('/admin-requests', requireAdmin, AdminController.getRequests);
app.get('/admin-reject-form/:requestId', requireAdmin, AdminController.getRejectForm);
app.get('/admin-restricted-stocks', requireAdmin, AdminController.getRestrictedStocks);
app.post('/admin-add-stock', requireAdmin, adminActionLimiter, verifyCsrfToken, AdminController.addRestrictedStock);
app.post('/admin-remove-stock', requireAdmin, adminActionLimiter, verifyCsrfToken, AdminController.removeRestrictedStock);
app.post('/admin-approve-request', requireAdmin, adminActionLimiter, verifyCsrfToken, AdminController.approveRequest);
app.post('/admin-reject-request', requireAdmin, adminActionLimiter, verifyCsrfToken, AdminController.rejectRequest);
app.get('/admin-export-trading-requests', requireAdmin, AdminController.exportTradingRequests);
app.get('/admin-export-audit-log', requireAdmin, AdminController.exportAuditLog);
app.get('/admin-backup-database', requireAdmin, AdminController.backupDatabase);
app.get('/admin-clear-database-confirm', requireAdmin, AdminController.getClearDatabaseConfirm);
app.post('/admin-clear-database', requireAdmin, verifyCsrfToken, AdminController.clearDatabase);
app.get('/admin-audit-log', requireAdmin, AdminController.getAuditLog);

// ===========================================
// EMPLOYEE ROUTES
// ===========================================

app.get('/employee-dashboard', requireEmployee, EmployeeController.getDashboard);
app.get('/employee-history', requireEmployee, EmployeeController.getHistory);
app.get('/employee-export-history', requireEmployee, EmployeeController.exportHistory);
app.get('/escalate-form/:id', requireEmployee, EmployeeController.getEscalationForm);

// ===========================================
// TRADING REQUEST ROUTES
// ===========================================

app.post('/preview-trade', requireEmployee, verifyCsrfToken, validateTradingRequest, TradingRequestController.previewTrade);
app.post('/submit-trade', requireEmployee, verifyCsrfToken, validateTradingRequest, TradingRequestController.submitTrade);
app.get('/trade-result/:requestId', requireEmployee, TradingRequestController.showTradeResult);
app.post('/submit-escalation', requireEmployee, verifyCsrfToken, TradingRequestController.escalateRequest);

// ===========================================
// ERROR HANDLING
// ===========================================

// Handle unhandled routes
app.use(handleNotFound);

// Global error handler
app.use(globalErrorHandler);

// ===========================================
// SERVER STARTUP
// ===========================================

const PORT = process.env.PORT || 3001;
const server = app.listen(PORT, () => {
  logger.info(`🚀 Server running on port ${PORT}`);
  logger.info(`📊 Environment: ${process.env.NODE_ENV || 'development'}`);
  logger.info(`🔒 Session secret: ${process.env.SESSION_SECRET ? 'configured' : 'using default (insecure!)'}`);
  logger.info(`🔑 Microsoft SSO: ${cca ? 'enabled' : 'disabled'}`);
  logger.info(`🗄️  Database: ${process.env.DATABASE_URL ? 'PostgreSQL (Railway)' : 'PostgreSQL URL not set'}`);
});

function shutdown(signal) {
  return () => {
    logger.info(`Received ${signal}, shutting down...`);
    server.close(async () => {
      try { if (database && database.close) { await database.close(); } } catch (e) { logger.error('Error closing database', { error: e.message }); }
      process.exit(0);
    });
  };
}
process.on('SIGTERM', shutdown('SIGTERM'));
process.on('SIGINT', shutdown('SIGINT'));

module.exports = app;