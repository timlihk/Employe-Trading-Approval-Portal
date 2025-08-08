require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const session = require('express-session');
const path = require('path');
const msal = require('@azure/msal-node');

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

// Initialize database on startup
const database = require('./models/database');
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

// Helper function to get the correct base URL
function getBaseUrl(req) {
  if (process.env.NODE_ENV === 'production' && req) {
    const protocol = req.get('x-forwarded-proto') || req.protocol || 'https';
    const host = req.get('host');
    return `${protocol}://${host}`;
  }
  return process.env.FRONTEND_URL || 'http://localhost:3001';
}

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

// Trust Railway's proxy for proper HTTPS detection
app.set('trust proxy', 1);

app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      scriptSrc: ["'self'"], // No JavaScript used in application
      imgSrc: ["'self'", "data:"],
    },
  },
}));

app.use(cors({
  origin: process.env.FRONTEND_URL || 'http://localhost:3001',
  credentials: true
}));

// Ensure SESSION_SECRET is provided - fail fast for security
if (!process.env.SESSION_SECRET) {
  logger.error('❌ FATAL: SESSION_SECRET environment variable is required for security');
  process.exit(1);
}

app.use(session({
  secret: process.env.SESSION_SECRET,
  resave: false,
  saveUninitialized: false,
  cookie: {
    secure: false, // Railway handles HTTPS, but the app sees HTTP internally
    httpOnly: true,
    maxAge: 24 * 60 * 60 * 1000, // 24 hours
    sameSite: 'lax' // Important for OAuth redirects
  },
  proxy: true // Trust Railway's proxy
}));

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Security middleware
app.use(addRequestId);
app.use(logRequest);
app.use(generalLimiter);

// Serve static files
app.use(express.static(path.join(__dirname, '../public'), {
  index: false  // Don't serve index.html automatically
}));

// ===========================================
// SYSTEM ROUTES
// ===========================================

// Health check endpoint for Railway
app.get('/health', async (req, res) => {
  try {
    let dbStatus = 'unknown';
    let dbError = null;
    
    // Check database connectivity
    try {
      if (process.env.DATABASE_URL) {
        const db = database.getDb();
        if (db.pool) {
          // Quick connection test
          await db.query('SELECT 1 as test');
          dbStatus = 'connected';
        } else {
          dbStatus = 'not_initialized';
        }
      } else {
        dbStatus = 'no_url_provided';
      }
    } catch (error) {
      dbStatus = 'error';
      dbError = error.message;
    }

    res.status(200).json({ 
      status: 'healthy', 
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      database: {
        status: dbStatus,
        error: dbError,
        hasUrl: !!process.env.DATABASE_URL
      }
    });
  } catch (error) {
    res.status(200).json({ 
      status: 'healthy', 
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      database: {
        status: 'healthcheck_error',
        error: error.message
      }
    });
  }
});

// Session test endpoint for debugging
app.get('/session-test', (req, res) => {
  const sessionId = req.sessionID;
  req.session.testValue = req.session.testValue || 0;
  req.session.testValue++;
  
  res.json({
    sessionId: sessionId,
    testValue: req.session.testValue,
    employee: req.session.employee || null,
    admin: req.session.admin || null,
    cookies: req.headers.cookie,
    secure: req.secure,
    protocol: req.protocol,
    host: req.get('host')
  });
});

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
    
    const authCodeUrlParameters = {
      scopes: ['user.read'],
      redirectUri: REDIRECT_URI,
    };

    try {
      const authUrl = await cca.getAuthCodeUrl(authCodeUrlParameters);
      logger.info('Redirecting to Microsoft login', { 
        redirectUri: REDIRECT_URI,
        sessionId: req.sessionID 
      });
      res.redirect(authUrl);
    } catch (error) {
      logger.error('Error generating auth URL', { error: error.message });
      res.redirect('/?error=sso_error');
    }
  });

  app.get('/api/auth/microsoft/callback', async (req, res) => {
    const baseUrl = getBaseUrl(req);
    const REDIRECT_URI = `${baseUrl}/api/auth/microsoft/callback`;
    
    const tokenRequest = {
      code: req.query.code,
      scopes: ['user.read'],
      redirectUri: REDIRECT_URI,
    };

    try {
      const response = await cca.acquireTokenByCode(tokenRequest);
      const userInfo = response.account;

      req.session.employee = {
        email: userInfo.username.toLowerCase(),
        name: userInfo.name || userInfo.username.split('@')[0]
      };

      logger.info('Microsoft SSO successful', { 
        email: userInfo.username.toLowerCase(),
        name: userInfo.name,
        sessionId: req.sessionID
      });

      res.redirect('/employee-dashboard?message=login_success');
    } catch (error) {
      logger.error('Microsoft SSO callback error', { 
        error: error.message,
        code: req.query.code ? 'present' : 'missing'
      });
      res.redirect('/?error=sso_callback_error');
    }
  });

  app.get('/api/auth/microsoft/logout', (req, res) => {
    req.session.destroy((err) => {
      if (err) {
        logger.error('Session destruction error', { error: err.message });
      }
      res.redirect('/?message=logged_out');
    });
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

app.post('/admin-authenticate', authLimiter, validateAdminAuth, AdminController.authenticateAdmin);
app.get('/admin-dashboard', requireAdmin, AdminController.getDashboard);
app.get('/admin-requests', requireAdmin, AdminController.getRequests);
app.get('/admin-reject-form/:requestId', requireAdmin, AdminController.getRejectForm);
app.get('/admin-restricted-stocks', requireAdmin, AdminController.getRestrictedStocks);
app.post('/admin-add-stock', requireAdmin, adminActionLimiter, AdminController.addRestrictedStock);
app.post('/admin-remove-stock', requireAdmin, adminActionLimiter, AdminController.removeRestrictedStock);
app.post('/admin-approve-request', requireAdmin, adminActionLimiter, AdminController.approveRequest);
app.post('/admin-reject-request', requireAdmin, adminActionLimiter, AdminController.rejectRequest);
app.get('/admin-export-trading-requests', requireAdmin, AdminController.exportTradingRequests);
app.get('/admin-export-audit-log', requireAdmin, AdminController.exportAuditLog);
app.get('/admin-backup-database', requireAdmin, AdminController.backupDatabase);
app.get('/admin-clear-database-confirm', requireAdmin, AdminController.getClearDatabaseConfirm);
app.post('/admin-clear-database', requireAdmin, AdminController.clearDatabase);
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

app.post('/preview-trade', requireEmployee, validateTradingRequest, TradingRequestController.previewTrade);
app.post('/submit-trade', requireEmployee, validateTradingRequest, TradingRequestController.submitTrade);
app.get('/trade-result/:requestId', requireEmployee, TradingRequestController.showTradeResult);
app.post('/submit-escalation', requireEmployee, TradingRequestController.escalateRequest);

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

app.listen(PORT, () => {
  logger.info(`🚀 Server running on port ${PORT}`);
  logger.info(`📊 Environment: ${process.env.NODE_ENV || 'development'}`);
  logger.info(`🔒 Session secret: ${process.env.SESSION_SECRET ? 'configured' : 'using default (insecure!)'}`);
  logger.info(`🔑 Microsoft SSO: ${cca ? 'enabled' : 'disabled'}`);
  logger.info(`🗄️  Database: ${process.env.DATABASE_URL ? 'PostgreSQL (Railway)' : 'SQLite (local)'}`);
});

module.exports = app;