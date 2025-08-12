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
const { globalErrorHandler, handleNotFound, catchAsync } = require('./middleware/errorHandler');

// MSAL Configuration (only if Azure credentials are provided)
let cca = null;
let REDIRECT_URI = null;
let POST_LOGOUT_REDIRECT_URI = null;

// Helper function to get the correct base URL
function getBaseUrl(req) {
  // In production, use the host from the request
  if (process.env.NODE_ENV === 'production' && req) {
    const protocol = req.get('x-forwarded-proto') || req.protocol || 'https';
    const host = req.get('host');
    return `${protocol}://${host}`;
  }
  // Otherwise use environment variable or default
  return process.env.FRONTEND_URL || 'http://localhost:3001';
}

if (process.env.AZURE_CLIENT_ID && process.env.AZURE_CLIENT_SECRET && process.env.AZURE_TENANT_ID) {
  const { msalConfig } = require('./config/msalConfig');
  cca = new msal.ConfidentialClientApplication(msalConfig);
  logger.info('Microsoft 365 SSO enabled');
} else {
  logger.info('Microsoft 365 SSO disabled - using email-based authentication');
}

// Initialize database on startup
const database = require('./models/database');
logger.info('Database initialized successfully');

// Template utilities
const { renderAdminPage, renderEmployeePage, renderPublicPage, generateNotificationBanner, renderCard, renderTable } = require('./utils/templates');

// Middleware functions
function requireAdmin(req, res, next) {
  if (!req.session.adminAuthenticated) {
    logSecurityEvent('UNAUTHORIZED_ADMIN_ACCESS', {
      url: req.originalUrl,
      method: req.method
    }, req);
    
    // Check if it's an API request (JSON response) or web request (redirect)
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

// All routes are defined in this file

const app = express();

// Trust Railway's proxy for proper HTTPS detection
app.set('trust proxy', 1);

app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      scriptSrc: ["'none'"], // Disable all JavaScript for pure HTML app
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

// Serve static files but exclude index.html to force server-side routing
app.use(express.static(path.join(__dirname, '../public'), {
  index: false  // Don't serve index.html automatically
}));




// All routes are defined inline in this file

// Health check endpoint for Railway
app.get('/health', (req, res) => {
  res.status(200).json({ 
    status: 'healthy', 
    timestamp: new Date().toISOString(),
    uptime: process.uptime()
  });
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

app.get('/', (req, res) => {
  console.log('Root route accessed');
  
  const landingHTML = `
  <!DOCTYPE html>
  <html lang="en">
  <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>Trading Compliance Portal - Inspiration Capital Management Limited</title>
      <link rel="stylesheet" href="styles-modern.css">
  </head>
  <body>
      <div class="container">
          <header>
              <div class="header-content">
                  <div>
                      <h1>Trading Compliance Portal</h1>
                      <div class="header-subtitle">Inspiration Capital Management Limited</div>
                      <div style="font-size: var(--font-size-sm); color: var(--gs-neutral-500); margin-top: var(--spacing-1);">Pre-Trading Approval & Risk Management System</div>
                  </div>
              </div>
          </header>
          
          <main>
              <div class="card">
                  <div class="card-header">
                      <h3 class="card-title">Welcome</h3>
                  </div>
                  <div class="card-body">
                      <p style="margin-bottom: var(--spacing-6); color: var(--gs-neutral-600); font-size: var(--font-size-base);">
                          Welcome to the Trading Compliance Portal. This system helps employees submit pre-trading approval requests and ensures compliance with company policies.
                      </p>
                      
                      <div style="display: grid; grid-template-columns: 1fr 1fr; gap: var(--spacing-6); margin: var(--spacing-6) 0;">
                          <div class="dashboard-card">
                              <div class="dashboard-icon">👤</div>
                              <h4>Employee Access</h4>
                              <p>Submit trading requests and view your request history</p>
                              <a href="/employee-login" class="btn btn-primary" style="text-decoration: none; display: inline-block;">Employee Login</a>
                          </div>
                          
                          <div class="dashboard-card">
                              <div class="dashboard-icon">⚙️</div>
                              <h4>Administrator Access</h4>
                              <p>Manage restricted stocks, view audit logs, and system settings</p>
                              <a href="/admin-login" class="btn btn-secondary" style="text-decoration: none; display: inline-block;">Admin Login</a>
                          </div>
                      </div>
                  </div>
              </div>
          </main>
      </div>
  </body>
  </html>`;
  
  res.send(landingHTML);
});

// Debug route to check audit logs
app.get('/debug-audit', async (req, res) => {
  try {
    const AuditLog = require('./models/AuditLog');
    const logs = await AuditLog.getAuditLogs();
    
    // Filter for escalation-related logs
    const escalationLogs = logs.filter(log => 
      log.action.includes('escalate') || 
      log.action.includes('approve_trading') || 
      log.action.includes('reject_trading')
    );
    
    res.send(`
      <h1>Escalation Audit Logs Debug</h1>
      <h3>Recent Escalation-Related Activities:</h3>
      <table border="1" style="border-collapse: collapse; margin: 20px 0;">
        <tr>
          <th style="padding: 10px;">Timestamp</th>
          <th style="padding: 10px;">User</th>
          <th style="padding: 10px;">Action</th>
          <th style="padding: 10px;">Request ID</th>
          <th style="padding: 10px;">Details</th>
        </tr>
        ${escalationLogs.map(log => `
          <tr>
            <td style="padding: 10px;">${formatHongKongTime(new Date(log.timestamp), true)}</td>
            <td style="padding: 10px;">${log.user_email} (${log.user_type})</td>
            <td style="padding: 10px;"><strong>${log.action}</strong></td>
            <td style="padding: 10px;">${log.target_id || 'N/A'}</td>
            <td style="padding: 10px; max-width: 400px; word-wrap: break-word;">${log.details || 'N/A'}</td>
          </tr>
        `).join('')}
      </table>
      <p>Total escalation logs: ${escalationLogs.length}</p>
      <a href="/test">Back to Test</a>
    `);
  } catch (error) {
    res.send(`<h1>Error: ${error.message}</h1>`);
  }
});

// Debug route to check restricted stocks
app.get('/debug-restricted', async (req, res) => {
  try {
    const RestrictedStock = require('./models/RestrictedStock');
    const restrictedStocks = await RestrictedStock.getAll();
    
    res.send(`
      <h1>Restricted Stocks Debug</h1>
      <h3>Current Restricted Stocks:</h3>
      <ul>
        ${restrictedStocks.map(stock => `<li><strong>${stock.ticker}</strong> - ${stock.company_name} (${stock.exchange || 'N/A'})</li>`).join('')}
      </ul>
      <p>Total count: ${restrictedStocks.length}</p>
      <a href="/test">Back to Test</a>
    `);
  } catch (error) {
    res.send(`<h1>Error: ${error.message}</h1>`);
  }
});

// Debug route to test server is working
app.get('/test', (req, res) => {
  res.send(`
    <!DOCTYPE html>
    <html>
    <head><title>Server Test</title></head>
    <body>
      <h1>✅ Server is Working!</h1>
      <p>Current time: ${new Date().toISOString()}</p>
      <p>If you can see this, the server is functioning correctly.</p>
      <div style="margin: 20px 0;">
        <h3>Test Form Submission:</h3>
        <form action="/test-form" method="POST">
          <input type="text" name="testInput" placeholder="Type something..." required>
          <button type="submit">Test Submit</button>
        </form>
      </div>
      <a href="/">Go to Main App</a>
    </body>
    </html>
  `);
});

// Test form handler
app.post('/test-form', (req, res) => {
  console.log('Test form submitted:', req.body);
  res.send(`
    <h1>✅ Form Submission Works!</h1>
    <p>You submitted: ${req.body.testInput}</p>
    <a href="/test">Back to Test</a>
    <a href="/">Go to Main App</a>
  `);
});

// TESTING ONLY: Employee login bypass route
app.get('/test-employee-login', async (req, res) => {
  try {
    // Set up a test employee session
    req.session.employee = {
      email: 'test.user@company.com',
      name: 'Test User'
    };
    req.session.employeeAuthenticated = true;
    req.session.employeeEmail = 'test.user@company.com';
    req.session.employeeName = 'Test User';
    
    // Ensure TSLA is in restricted list for testing
    const RestrictedStock = require('./models/RestrictedStock');
    try {
      await RestrictedStock.add('TSLA', 'Tesla Inc.', 'NASDAQ');
      console.log('Added TSLA to restricted list');
    } catch (error) {
      // Already exists, that's fine
      console.log('TSLA already in restricted list or error adding:', error.message);
    }
    
    console.log('Test employee session created');
    res.redirect('/employee-dashboard');
  } catch (error) {
    console.error('Error in test employee login:', error);
    res.redirect('/?error=test_login_failed');
  }
});

// Employee login page
app.get('/employee-login', (req, res) => {
  const loginHTML = `
  <!DOCTYPE html>
  <html lang="en">
  <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>Employee Login - Inspiration Capital Management Limited</title>
      <link rel="stylesheet" href="styles-modern.css">
  </head>
  <body>
      <div class="container">
          <header>
              <div class="header-content">
                  <div>
                      <h1>Trading Compliance Portal</h1>
                      <div class="header-subtitle">Inspiration Capital Management Limited</div>
                      <div style="font-size: var(--font-size-sm); color: var(--gs-neutral-500); margin-top: var(--spacing-1);">Employee Authentication</div>
                  </div>
              </div>
          </header>
          
          <main>
              <div class="card">
                  <div class="card-header">
                      <h3 class="card-title">Employee Login</h3>
                  </div>
                  <div class="card-body">
                      <!-- Microsoft 365 SSO Login Only -->
                      <div style="text-align: center; margin-bottom: var(--spacing-6);">
                          <a href="/api/auth/microsoft/login" class="btn btn-primary" style="display: inline-block; padding: 20px 40px; font-size: 18px; text-decoration: none;">
                              <span style="display: inline-flex; align-items: center;">
                                  <svg width="24" height="24" viewBox="0 0 23 23" style="margin-right: 12px;" fill="currentColor">
                                      <path d="M11 11H0V0h11v11zm2 0h11V0H13v11zM0 24h11V13H0v11zm13 0h11V13H13v11z"/>
                                  </svg>
                                  Sign in with Microsoft 365
                              </span>
                          </a>
                          <p style="margin-top: var(--spacing-4); color: var(--gs-neutral-600); font-size: var(--font-size-base);">
                              Sign in with your corporate Microsoft account to access the Trading Compliance Portal
                          </p>
                      </div>
                      
                      ${req.query.error ? `
                      <div style="margin-bottom: var(--spacing-4); padding: var(--spacing-3); background: #f8d7da; border: 1px solid #f5c6cb; border-radius: var(--radius); color: #721c24; text-align: center;">
                          Authentication failed. Please check your Microsoft 365 credentials and try again.
                      </div>
                      ` : ''}
                      
                      <div style="text-align: center; margin-top: var(--spacing-6);">
                          <a href="/" style="color: var(--gs-primary-blue); text-decoration: none;">← Back to Home</a>
                      </div>
                  </div>
              </div>
          </main>
      </div>
  </body>
  </html>`;
  
  res.send(loginHTML);
});

// Employee authentication route
app.post('/employee-authenticate', (req, res) => {
  if (cca) {
    // Microsoft 365 SSO enabled
    res.redirect('/api/auth/microsoft/login');
  } else {
    // This route should not be called without SSO
    res.redirect('/employee-login?error=sso_required');
  }
});

// Microsoft 365 Authentication Routes
app.get('/api/auth/microsoft/login', async (req, res) => {
  try {
    // Check if Microsoft SSO is enabled
    if (!cca) {
      // Azure not configured, show configuration message
      const configHTML = `
      <!DOCTYPE html>
      <html lang="en">
      <head>
          <meta charset="UTF-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <title>Microsoft 365 Configuration Required - Inspiration Capital Management Limited</title>
          <link rel="stylesheet" href="/styles-modern.css">
      </head>
      <body>
          <div class="container">
              <header>
                  <div class="header-content">
                      <div>
                          <h1>Trading Compliance Portal</h1>
                          <div class="header-subtitle">Inspiration Capital Management Limited</div>
                          <div style="font-size: var(--font-size-sm); color: var(--gs-neutral-500); margin-top: var(--spacing-1);">Microsoft 365 Setup Required</div>
                      </div>
                  </div>
              </header>
              
              <main>
                  <div class="card">
                      <div class="card-header">
                          <h3 class="card-title">Microsoft 365 Authentication Not Configured</h3>
                      </div>
                      <div class="card-body">
                          <div style="padding: var(--spacing-4); background: #fff3cd; border: 1px solid #ffc107; border-radius: var(--radius); margin-bottom: var(--spacing-4);">
                              <p style="margin: 0; color: #856404;">
                                  <strong>⚠️ Microsoft 365 SSO is not configured</strong><br>
                                  To enable Microsoft 365 authentication, please configure the following environment variables:
                              </p>
                          </div>
                          
                          <div style="background: var(--gs-neutral-100); padding: var(--spacing-4); border-radius: var(--radius); font-family: monospace; font-size: var(--font-size-sm);">
                              AZURE_CLIENT_ID=your-app-client-id<br>
                              AZURE_CLIENT_SECRET=your-app-secret<br>
                              AZURE_TENANT_ID=your-tenant-id<br>
                              REDIRECT_URI=http://localhost:3001/api/auth/microsoft/callback
                          </div>
                          
                          <p style="margin-top: var(--spacing-4); color: var(--gs-neutral-600);">
                              For now, you can use the email-based login for testing purposes.
                          </p>
                          
                          <div style="text-align: center; margin-top: var(--spacing-6);">
                              <a href="/employee-login" class="btn btn-secondary" style="text-decoration: none;">← Back to Login</a>
                          </div>
                      </div>
                  </div>
              </main>
          </div>
      </body>
      </html>`;
      return res.send(configHTML);
    }

    // Use dynamic redirect URI based on request
    const baseUrl = getBaseUrl(req);
    const redirectUri = `${baseUrl}/api/auth/microsoft/callback`;
    
    const authCodeUrlParameters = {
      scopes: ['user.read', 'profile', 'email', 'openid'],
      redirectUri: redirectUri,
    };

    console.log('Microsoft login - Redirect URI:', redirectUri);
    
    // Get url to sign user in and consent to scopes
    const authUrl = await cca.getAuthCodeUrl(authCodeUrlParameters);
    res.redirect(authUrl);
  } catch (error) {
    console.error('Error in Microsoft login:', error);
    res.redirect('/employee-login?error=auth_failed');
  }
});

// Microsoft 365 callback route
app.get('/api/auth/microsoft/callback', async (req, res) => {
  if (!cca) {
    return res.redirect('/?error=sso_not_configured');
  }
  
  try {
    // Use dynamic redirect URI based on request
    const baseUrl = getBaseUrl(req);
    const redirectUri = `${baseUrl}/api/auth/microsoft/callback`;
    
    const tokenRequest = {
      code: req.query.code,
      scopes: ['user.read', 'profile', 'email', 'openid'],
      redirectUri: redirectUri,
    };

    console.log('Microsoft callback - Redirect URI:', redirectUri);

    // Acquire token using authorization code
    const response = await cca.acquireTokenByCode(tokenRequest);
    
    // Get user details from the token
    const account = response.account;
    
    // Set employee session with Microsoft account info
    req.session.employee = {
      email: account.username || account.email,
      name: account.name || account.username.split('@')[0],
      authenticated: true,
      authMethod: 'microsoft365',
      microsoftId: account.homeAccountId
    };
    
    console.log('Microsoft 365 login successful for:', account.username);
    console.log('Session data set:', req.session.employee);
    
    // Save session before redirect
    req.session.save((err) => {
      if (err) {
        console.error('Session save error:', err);
        return res.status(500).send('Session error. Please try again.');
      }
      console.log('Session saved successfully, redirecting to dashboard');
      // Redirect to employee dashboard
      res.redirect('/employee-dashboard');
    });
  } catch (error) {
    console.error('Error in Microsoft callback:', error);
    
    // Show error page
    const errorHTML = `
    <!DOCTYPE html>
    <html lang="en">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Authentication Failed - Inspiration Capital Management Limited</title>
        <link rel="stylesheet" href="/styles-modern.css">
    </head>
    <body>
        <div class="container">
            <header>
                <div class="header-content">
                    <div>
                        <h1>Trading Compliance Portal</h1>
                        <div class="header-subtitle">Inspiration Capital Management Limited</div>
                        <div style="font-size: var(--font-size-sm); color: var(--gs-neutral-500); margin-top: var(--spacing-1);">Authentication Error</div>
                    </div>
                </div>
            </header>
            
            <main>
                <div class="card">
                    <div class="card-header">
                        <h3 class="card-title">Authentication Failed</h3>
                    </div>
                    <div class="card-body">
                        <div style="padding: var(--spacing-4); background: #f8d7da; border: 1px solid #f5c6cb; border-radius: var(--radius); margin-bottom: var(--spacing-4);">
                            <p style="margin: 0; color: #721c24;">
                                <strong>Unable to complete Microsoft 365 authentication</strong><br>
                                ${error.message || 'An error occurred during the authentication process.'}
                            </p>
                        </div>
                        
                        <p style="color: var(--gs-neutral-600);">
                            Please try again or contact your system administrator if the problem persists.
                        </p>
                        
                        <div style="text-align: center; margin-top: var(--spacing-6);">
                            <a href="/employee-login" class="btn btn-primary" style="text-decoration: none;">Try Again</a>
                        </div>
                    </div>
                </div>
            </main>
        </div>
    </body>
    </html>`;
    res.send(errorHTML);
  }
});

// Microsoft 365 logout helper
app.get('/api/auth/microsoft/logout', (req, res) => {
  if (!cca) {
    // If SSO not configured, just clear session and redirect
    req.session.destroy(() => {
      res.redirect('/?message=logged_out');
    });
    return;
  }
  
  // Use dynamic logout redirect URI
  const baseUrl = getBaseUrl(req);
  const postLogoutRedirectUri = baseUrl;
  
  const logoutUri = `https://login.microsoftonline.com/${process.env.AZURE_TENANT_ID}/oauth2/v2.0/logout?post_logout_redirect_uri=${encodeURIComponent(postLogoutRedirectUri)}`;
  
  console.log('Microsoft logout - Post logout redirect URI:', postLogoutRedirectUri);
  
  // Clear session
  req.session.destroy((err) => {
    if (err) {
      console.error('Session destruction error:', err);
    }
    // Redirect to Microsoft logout
    res.redirect(logoutUri);
  });
});

// Admin login page  
app.get('/admin-login', (req, res) => {
  const adminLoginHTML = `
  <!DOCTYPE html>
  <html lang="en">
  <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>Admin Login - Inspiration Capital Management Limited</title>
      <link rel="stylesheet" href="styles-modern.css">
  </head>
  <body>
      <div class="container">
          <header>
              <div class="header-content">
                  <div>
                      <h1>Trading Compliance Portal</h1>
                      <div class="header-subtitle">Inspiration Capital Management Limited</div>
                      <div style="font-size: var(--font-size-sm); color: var(--gs-neutral-500); margin-top: var(--spacing-1);">Administrator Access</div>
                  </div>
              </div>
          </header>
          
          <main>
              <div class="card">
                  <div class="card-header">
                      <h3 class="card-title">Administrator Login</h3>
                  </div>
                  <div class="card-body">
                      <form action="/admin-authenticate" method="POST">
                          <div class="form-group inline">
                              <label class="form-label blue-label" for="username">Username</label>
                              <input type="text" id="username" name="username" class="form-control compact" required>
                          </div>
                          
                          <div class="form-group inline">
                              <label class="form-label blue-label" for="password">Password</label>
                              <input type="password" id="password" name="password" class="form-control compact" required>
                          </div>
                          
                          <div style="margin-top: var(--spacing-6);">
                              <button type="submit" class="btn btn-primary" style="padding: 15px 30px; font-size: 16px;">Login</button>
                          </div>
                      </form>
                      
                      <div style="text-align: center; margin-top: var(--spacing-6);">
                          <a href="/" style="color: var(--gs-primary-blue); text-decoration: none;">← Back to Home</a>
                      </div>
                  </div>
              </div>
          </main>
      </div>
  </body>
  </html>`;
  
  res.send(adminLoginHTML);
});

// Import validation middleware
const { validateAdminAuth } = require('./middleware/validation');

// Admin authentication route
app.post('/admin-authenticate', authLimiter, validateAdminAuth, async (req, res) => {
  logger.info('Admin authentication attempt', { 
    requestId: req.id,
    username: req.body.username 
  });
  
  try {
    const { username, password } = req.body;
    
    // Validate input
    if (!username || !password) {
      return res.status(400).send('Username and password are required');
    }
    
    // Check credentials
    const adminUsername = process.env.ADMIN_USERNAME || 'admin';
    const adminPassword = process.env.ADMIN_PASSWORD || 'admin123';
    
    console.log('Admin credentials check:', {
      providedUsername: username,
      expectedUsername: adminUsername,
      passwordMatch: password === adminPassword
    });
    
    if (username === adminUsername && password === adminPassword) {
      // Set admin session
      req.session.adminAuthenticated = true;
      req.session.admin = { username: username };
      
      console.log('Admin session set, saving...');
      
      // Save session before redirect
      req.session.save((err) => {
        if (err) {
          console.error('Session save error:', err);
          return res.status(500).send('Session error. Please try again.');
        }
        console.log('Admin session saved, redirecting to dashboard');
        // Redirect to admin dashboard
        res.redirect('/admin-dashboard');
      });
    } else {
    // Invalid credentials - show error
    const errorHTML = `
    <!DOCTYPE html>
    <html lang="en">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Login Failed - Inspiration Capital Management Limited</title>
        <link rel="stylesheet" href="styles-modern.css">
    </head>
    <body>
        <div class="container">
            <header>
                <div class="header-content">
                    <div>
                        <h1>Trading Compliance Portal</h1>
                        <div class="header-subtitle">Administrator Access</div>
                    </div>
                </div>
            </header>
            
            <main>
                <div class="card">
                    <div class="card-header">
                        <h3 class="card-title">❌ Login Failed</h3>
                    </div>
                    <div class="card-body">
                        <div style="background: #f8d7da; border: 1px solid #f5c6cb; color: #721c24; padding: var(--spacing-4); border-radius: var(--radius); margin: var(--spacing-4) 0;">
                            <h4 style="margin: 0 0 var(--spacing-2) 0;">Error:</h4>
                            <p style="margin: 0; font-size: var(--font-size-sm);">Invalid username or password. Please try again.</p>
                        </div>
                        
                        <div style="text-align: center; margin-top: var(--spacing-6);">
                            <a href="/admin-login" class="btn btn-primary" style="text-decoration: none; display: inline-block; padding: 15px 30px;">Try Again</a>
                            <a href="/" class="btn btn-secondary" style="text-decoration: none; display: inline-block; padding: 15px 30px; margin-left: 20px;">← Back to Home</a>
                        </div>
                    </div>
                </div>
            </main>
        </div>
    </body>
    </html>`;
    
    res.status(401).send(errorHTML);
    }
  } catch (error) {
    console.error('Admin authentication error:', error);
    res.status(500).send('An error occurred during authentication. Please try again.');
  }
});

// Admin dashboard
app.get('/admin-dashboard', requireAdmin, (req, res) => {
  const dashboardContent = renderCard('Admin Dashboard', `
                      <div style="display: grid; grid-template-columns: 1fr 1fr 1fr; gap: var(--spacing-6); margin: var(--spacing-6) 0;">
                          <div class="dashboard-card">
                              <div class="dashboard-icon">📊</div>
                              <h4>Restricted Trading List</h4>
                              <p>Manage restricted stock list - add or remove stocks from trading restrictions</p>
                              <a href="/admin-restricted-stocks" class="btn btn-primary" style="text-decoration: none; display: inline-block;">Manage List</a>
                          </div>
                          
                          <div class="dashboard-card">
                              <div class="dashboard-icon">📋</div>
                              <h4>Trading Requests</h4>
                              <p>View and manage employee trading requests and approval status</p>
                              <a href="/admin-requests" class="btn btn-primary" style="text-decoration: none; display: inline-block;">View Requests</a>
                          </div>
                          
                          <div class="dashboard-card">
                              <div class="dashboard-icon">💾</div>
                              <h4>Database Backup</h4>
                              <p>Download a complete backup of the database to your local machine</p>
                              <a href="/admin-backup-database" class="btn btn-primary" style="text-decoration: none; display: inline-block;">Download Backup</a>
                          </div>
                      </div>`, 'Welcome, Administrator');

  res.send(renderAdminPage('Admin Dashboard', dashboardContent));
});

// Admin logout
app.get('/admin-logout', (req, res) => {
  req.session.destroy((err) => {
    if (err) {
      console.error('Error destroying admin session:', err);
    }
    res.redirect('/?message=admin_logged_out');
  });
});

// Employee dashboard route (after authentication)
app.get('/employee-dashboard', requireEmployee, (req, res) => {
  try {
    console.log('Employee dashboard accessed');
    console.log('Session:', req.session);
    console.log('Employee data:', req.session.employee);
    
    console.log('Employee authenticated:', req.session.employee.email);
  } catch (error) {
    console.error('Error in employee dashboard:', error);
    return res.redirect('/?error=server_error');
  }
  
  // Get error message from query params
  const errorMessage = req.query.error || '';
  const ticker = req.query.ticker || '';
  const shares = req.query.shares || '';
  const trading_type = req.query.trading_type || '';
  
  const errorBanner = errorMessage ? `
      <div style="margin-bottom: var(--spacing-6); padding: var(--spacing-4); background: #f8d7da; border: 1px solid #f5c6cb; border-radius: var(--radius); color: #721c24;">
          <strong>Error:</strong> ${errorMessage}
      </div>
  ` : '';
  
  const tradingForm = `
      <form action="/preview-trade" method="POST" style="max-width: 480px; margin: 0 auto;">
          
          <!-- Stock Ticker Field -->
          <div style="margin-bottom: var(--spacing-6);">
              <label for="ticker" style="display: block; font-size: var(--font-size-sm); font-weight: 600; color: var(--gs-neutral-700); margin-bottom: var(--spacing-2);">Stock Ticker</label>
              <input type="text" 
                     id="ticker" 
                     name="ticker" 
                     class="form-control" 
                     placeholder="e.g., AAPL, MSFT, 0005.HK, SAP.DE" 
                     required 
                     maxlength="15"
                     value="${ticker}"
                     style="width: 100%; padding: var(--spacing-3) var(--spacing-4); font-size: var(--font-size-base); border: 2px solid var(--gs-neutral-300); border-radius: var(--radius); transition: all 0.2s ease;">
          </div>
          
          <!-- Number of Shares Field -->
          <div style="margin-bottom: var(--spacing-6);">
              <label for="shares" style="display: block; font-size: var(--font-size-sm); font-weight: 600; color: var(--gs-neutral-700); margin-bottom: var(--spacing-2);">Number of Shares</label>
              <input type="number" 
                     id="shares" 
                     name="shares" 
                     class="form-control" 
                     min="1" 
                     max="1000000" 
                     required 
                     placeholder="Enter quantity (e.g., 100)"
                     value="${shares}"
                     style="width: 100%; padding: var(--spacing-3) var(--spacing-4); font-size: var(--font-size-base); border: 2px solid var(--gs-neutral-300); border-radius: var(--radius); transition: all 0.2s ease;">
          </div>
          
          <!-- Trading Type Field -->
          <div style="margin-bottom: var(--spacing-8);">
              <label style="display: block; font-size: var(--font-size-sm); font-weight: 600; color: var(--gs-neutral-700); margin-bottom: var(--spacing-3);">Trading Action</label>
              <div style="display: flex; gap: var(--spacing-3); justify-content: center;">
                  <label style="flex: 1; display: flex; align-items: center; justify-content: center; padding: var(--spacing-4) var(--spacing-5); background: var(--success); color: white; border-radius: var(--radius); cursor: pointer; font-weight: 500; transition: all 0.2s ease; border: 2px solid var(--success);">
                      <input type="radio" name="trading_type" value="buy" required ${trading_type === 'buy' ? 'checked' : ''} style="margin-right: var(--spacing-2); scale: 1.2;">
                      <span style="font-size: var(--font-size-lg);">📈</span>
                      <span style="margin-left: var(--spacing-2);">BUY</span>
                  </label>
                  <label style="flex: 1; display: flex; align-items: center; justify-content: center; padding: var(--spacing-4) var(--spacing-5); background: var(--danger); color: white; border-radius: var(--radius); cursor: pointer; font-weight: 500; transition: all 0.2s ease; border: 2px solid var(--danger);">
                      <input type="radio" name="trading_type" value="sell" required ${trading_type === 'sell' ? 'checked' : ''} style="margin-right: var(--spacing-2); scale: 1.2;">
                      <span style="font-size: var(--font-size-lg);">📉</span>
                      <span style="margin-left: var(--spacing-2);">SELL</span>
                  </label>
              </div>
          </div>
          
          <!-- Submit Button -->
          <div style="text-align: center; margin-top: var(--spacing-8);">
              <button type="submit" 
                      class="btn btn-primary" 
                      style="width: 100%; max-width: 280px; padding: var(--spacing-4) var(--spacing-6); font-size: var(--font-size-lg); font-weight: 600; border-radius: var(--radius); border: none; background: var(--gs-primary-blue); color: white; cursor: pointer; transition: all 0.2s ease; box-shadow: 0 2px 4px rgba(0,0,0,0.1);">
                  Preview Trade →
              </button>
          </div>
      </form>
  `;
  
  const cardContent = `
      <div style="font-size: var(--font-size-sm); color: var(--gs-neutral-600); margin-bottom: var(--spacing-4);">
          Welcome, ${req.session.employee.name} (${req.session.employee.email})
      </div>
      ${errorBanner}
      ${tradingForm}
  `;
  
  const submitCard = renderCard('Submit Trading Request', cardContent);
  
  const content = submitCard;
  
  const html = renderEmployeePage('Employee Dashboard', content, req.session.employee.name, req.session.employee.email);
  res.send(html);
});

// Employee logout route
app.get('/employee-logout', (req, res) => {
  // Check if user logged in via Microsoft 365 and SSO is properly configured
  if (req.session.employee && req.session.employee.authMethod === 'microsoft365' && 
      process.env.POST_LOGOUT_REDIRECT_URI && 
      process.env.POST_LOGOUT_REDIRECT_URI.startsWith('http')) {
    // Redirect to Microsoft 365 logout only if properly configured
    res.redirect('/api/auth/microsoft/logout');
  } else {
    // Regular logout or fallback for misconfigured SSO - clear session
    req.session.destroy((err) => {
      if (err) {
        console.error('Error destroying session:', err);
      }
      res.redirect('/?message=logged_out');
    });
  }
});


// Helper function to format Hong Kong time for display
function formatHongKongTime(date = new Date(), includeTime = false) {
  let utcDate;
  
  if (typeof date === 'string') {
    // Database timestamp string - explicitly treat as UTC by appending 'Z'
    utcDate = new Date(date + 'Z');
  } else {
    utcDate = date;
  }
  
  // Convert UTC to Hong Kong time (UTC+8)
  const hkTime = new Date(utcDate.getTime() + (8 * 60 * 60 * 1000));
  
  if (includeTime) {
    // Format: DD/MM/YYYY, HH:MM:SS
    const day = hkTime.getUTCDate().toString().padStart(2, '0');
    const month = (hkTime.getUTCMonth() + 1).toString().padStart(2, '0');
    const year = hkTime.getUTCFullYear();
    const hour = hkTime.getUTCHours().toString().padStart(2, '0');
    const minute = hkTime.getUTCMinutes().toString().padStart(2, '0');
    const second = hkTime.getUTCSeconds().toString().padStart(2, '0');
    
    return `${day}/${month}/${year}, ${hour}:${minute}:${second}`;
  } else {
    // Format: DD/MM/YYYY
    const day = hkTime.getUTCDate().toString().padStart(2, '0');
    const month = (hkTime.getUTCMonth() + 1).toString().padStart(2, '0');
    const year = hkTime.getUTCFullYear();
    
    return `${day}/${month}/${year}`;
  }
}

// Format datetime for Excel CSV export (no comma, Excel-compatible format)
function formatExcelDateTime(date = new Date()) {
  let utcDate;
  
  if (typeof date === 'string') {
    // Database timestamp string - explicitly treat as UTC by appending 'Z'
    utcDate = new Date(date + 'Z');
  } else {
    utcDate = date;
  }
  
  // Convert UTC to Hong Kong time (UTC+8)
  const hkTime = new Date(utcDate.getTime() + (8 * 60 * 60 * 1000));
  
  // Format: YYYY-MM-DD HH:MM:SS (Excel recognizes this format)
  const year = hkTime.getUTCFullYear();
  const month = (hkTime.getUTCMonth() + 1).toString().padStart(2, '0');
  const day = hkTime.getUTCDate().toString().padStart(2, '0');
  const hour = hkTime.getUTCHours().toString().padStart(2, '0');
  const minute = hkTime.getUTCMinutes().toString().padStart(2, '0');
  const second = hkTime.getUTCSeconds().toString().padStart(2, '0');
  
  return `${year}-${month}-${day} ${hour}:${minute}:${second}`;
}


// Yahoo Finance API ticker validation
async function validateTickerWithYahoo(ticker) {
  try {
    // Use Yahoo Finance query API to validate ticker and get basic info
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(ticker)}`;
    
    // Add timeout to prevent hanging
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 5000); // 5 second timeout
    
    const response = await fetch(url, {
      signal: controller.signal,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
      }
    });
    clearTimeout(timeoutId);
    
    const data = await response.json();
    
    if (data && data.chart && data.chart.result && data.chart.result.length > 0) {
      const result = data.chart.result[0];
      const meta = result.meta;
      
      if (meta && meta.symbol) {
        return {
          isValid: true,
          symbol: meta.symbol,
          currency: meta.currency || 'USD',
          exchangeName: meta.exchangeName || 'Unknown',
          longName: meta.longName || meta.shortName || `${ticker} Corporation`,
          regularMarketPrice: meta.regularMarketPrice || 50.00,
          timezone: meta.timezone || 'UTC'
        };
      }
    }
    
    return { isValid: false, error: 'Ticker not found' };
  } catch (error) {
    console.error('Yahoo Finance API error:', error.message);
    return { isValid: false, error: 'Unable to validate ticker' };
  }
}

// Simple exchange rate cache (in production, you'd use a proper database)
let exchangeRateCache = {
  lastUpdated: null,
  rates: {}
};

async function getExchangeRate(fromCurrency, toCurrency = 'USD') {
  if (fromCurrency === toCurrency) {
    return 1.0;
  }
  
  // Check cache (refresh every 30 minutes)
  const now = new Date();
  if (exchangeRateCache.lastUpdated && 
      (now - exchangeRateCache.lastUpdated) < 30 * 60 * 1000 &&
      exchangeRateCache.rates[fromCurrency]) {
    return exchangeRateCache.rates[fromCurrency];
  }
  
  try {
    // Use a free exchange rate API (exchangerate-api.com)
    // In production, you might want to use a paid service for better reliability
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 5000); // 5 second timeout
    
    const response = await fetch(`https://api.exchangerate-api.com/v4/latest/${fromCurrency}`, {
      signal: controller.signal
    });
    clearTimeout(timeoutId);
    
    const data = await response.json();
    
    if (data && data.rates && data.rates[toCurrency]) {
      // Update cache
      if (!exchangeRateCache.rates) exchangeRateCache.rates = {};
      exchangeRateCache.rates[fromCurrency] = data.rates[toCurrency];
      exchangeRateCache.lastUpdated = now;
      
      return data.rates[toCurrency];
    }
  } catch (error) {
    console.error('Failed to fetch live exchange rate, using fallback:', error.message);
  }
  
  // Fallback exchange rates (approximate, should be updated regularly in production)
  const fallbackRates = {
    'HKD': 0.128,  // HKD to USD
    'GBP': 1.27,   // GBP to USD  
    'EUR': 1.09,   // EUR to USD
    'JPY': 0.0067, // JPY to USD
    'CHF': 1.11,   // CHF to USD
    'CAD': 0.74,   // CAD to USD
    'AUD': 0.66,   // AUD to USD
    'CNY': 0.14,   // CNY to USD
    'USD': 1.0
  };
  
  return fallbackRates[fromCurrency] || 1.0;
}

function formatCurrency(amount, currency) {
  const currencySymbols = {
    'USD': '$',
    'HKD': 'HK$',
    'GBP': '£',
    'EUR': '€',
    'JPY': '¥',
    'CHF': 'CHF ',
    'CAD': 'C$',
    'AUD': 'A$',
    'CNY': '¥'
  };
  
  const symbol = currencySymbols[currency] || currency + ' ';
  return symbol + amount.toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  });
}

// Helper function to generate error page
function generateErrorPage(errorMessage) {
  return `
  <!DOCTYPE html>
  <html lang="en">
  <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>Invalid Ticker - Inspiration Capital Management Limited</title>
      <link rel="stylesheet" href="styles-modern.css">
  </head>
  <body>
      <div class="container">
          <header>
              <div class="header-content">
                  <div>
                      <h1>Trading Compliance Portal</h1>
                      <div class="header-subtitle">Inspiration Capital Management Limited</div>
                      <div style="font-size: var(--font-size-sm); color: var(--gs-neutral-500); margin-top: var(--spacing-1);">Pre-Trading Approval & Risk Management System</div>
                  </div>
              </div>
          </header>
          
          <main>
              <div class="card">
                  <div class="card-header">
                      <h3 class="card-title">❌ Invalid Ticker</h3>
                  </div>
                  <div class="card-body">
                      <div style="background: #f8d7da; border: 1px solid #f5c6cb; color: #721c24; padding: var(--spacing-4); border-radius: var(--radius); margin: var(--spacing-4) 0;">
                          <h4 style="margin: 0 0 var(--spacing-2) 0;">Error:</h4>
                          <p style="margin: 0; font-size: var(--font-size-sm);">${errorMessage}</p>
                      </div>
                      
                      <div style="background: var(--gs-neutral-200); border: 1px solid var(--gs-neutral-400); border-radius: var(--radius); padding: var(--spacing-4); margin: var(--spacing-4) 0;">
                          <h4 style="margin: 0 0 var(--spacing-3) 0; color: var(--gs-neutral-800);">Valid Ticker Examples:</h4>
                          <div style="display: grid; grid-template-columns: 1fr 1fr; gap: var(--spacing-2); font-size: var(--font-size-sm);">
                              <div><strong>US:</strong> AAPL, TSLA, GOOGL, MSFT, NVDA</div>
                              <div><strong>Hong Kong:</strong> 0001.HK, 0005.HK, 0700.HK</div>
                              <div><strong>London:</strong> LLOY.L, BP.L, SHEL.L</div>
                              <div><strong>Others:</strong> AMZN, META, NFLX</div>
                          </div>
                      </div>
                      
                      <div style="margin-top: var(--spacing-6); text-align: center;">
                          <a href="/employee-dashboard" class="btn btn-primary" style="padding: 15px 30px; font-size: 16px; text-decoration: none;">
                              ← Back to Form
                          </a>
                      </div>
                  </div>
              </div>
          </main>
      </div>
  </body>
  </html>`;
}


// Import validation middleware  
const { validateTradingRequest } = require('./middleware/validation');

// Server-side trade preview route (no JavaScript required)
app.post('/preview-trade', validateTradingRequest, async (req, res) => {
  
  const { ticker, shares, trading_type } = req.body;
  
  try {
    // Check authentication (employee must be logged in)
    if (!req.session.employee || !req.session.employee.email) {
      return res.redirect('/?error=authentication_required');
    }
    
    // Validate inputs
    if (!ticker || !shares || !trading_type) {
      return res.status(400).send('Missing required fields');
    }
    
    // Validate ticker format (basic format check)
    const tickerUpper = ticker.toUpperCase().trim();
    if (!/^[A-Z0-9]{1,10}(\.[A-Z]{1,3})?$/.test(tickerUpper)) {
      const errorMsg = 'Invalid ticker format. Please use valid ticker symbols like: AAPL, FEIM, 0001.HK, LLOY.L';
      return res.redirect(`/employee-dashboard?error=${encodeURIComponent(errorMsg)}&ticker=${encodeURIComponent(ticker)}&shares=${encodeURIComponent(shares)}&trading_type=${encodeURIComponent(trading_type)}`);
    }
    
    // Validate ticker with Yahoo Finance API
    const tickerValidation = await validateTickerWithYahoo(tickerUpper);
    
    if (!tickerValidation.isValid) {
      const errorMsg = `Invalid ticker: ${tickerUpper}. ${tickerValidation.error || 'Ticker not found on financial markets.'}`;
      return res.redirect(`/employee-dashboard?error=${encodeURIComponent(errorMsg)}&ticker=${encodeURIComponent(ticker)}&shares=${encodeURIComponent(shares)}&trading_type=${encodeURIComponent(trading_type)}`);
    }
    
    // Use real market data from Yahoo Finance
    const stock = {
      name: tickerValidation.longName,
      price: tickerValidation.regularMarketPrice,
      currency: tickerValidation.currency,
      exchange: tickerValidation.exchangeName
    };
    
    
    // Use currency from Yahoo Finance API (more accurate than guessing from ticker format)
    const stockCurrency = stock.currency || 'USD';
    const exchangeRate = await getExchangeRate(stockCurrency, 'USD');
    
    const localTotalValue = stock.price * parseInt(shares);
    const usdTotalValue = localTotalValue * exchangeRate;
    const usdSharePrice = stock.price * exchangeRate;
    
    // Generate confirmation HTML with compliance declaration
    const confirmationHTML = `
    <!DOCTYPE html>
    <html lang="en">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Confirm Trade - Inspiration Capital Management Limited</title>
        <link rel="stylesheet" href="styles-modern.css">
    </head>
    <body>
        <div class="container">
            <header>
                <div class="header-content">
                    <div>
                        <h1>Trading Compliance Portal</h1>
                        <div class="header-subtitle">Pre-Trading Approval & Risk Management System</div>
                    </div>
                </div>
            </header>
            
            <nav style="display: flex; gap: var(--spacing-4); padding: var(--spacing-4); background: var(--gs-neutral-200); border-radius: var(--radius); margin-bottom: var(--spacing-6);">
                <a href="/employee-dashboard" class="btn btn-secondary" style="text-decoration: none;">Submit Request</a>
                <a href="/employee-history" class="btn btn-secondary" style="text-decoration: none;">Request History</a>
                <a href="/employee-logout" class="btn btn-secondary" style="text-decoration: none;">Logout</a>
            </nav>
            
            <main>
                <!-- Trade Confirmation Box -->
                <div class="card" style="margin-bottom: var(--spacing-6);">
                    <div class="card-header">
                        <h3 class="card-title">📋 Trade Confirmation</h3>
                    </div>
                    <div class="card-body">
                        <div style="background: var(--gs-neutral-200); border: 1px solid var(--gs-neutral-400); border-radius: var(--radius); padding: var(--spacing-6); margin: var(--spacing-4) 0;">
                            <h4 style="margin: 0 0 var(--spacing-4) 0; color: var(--gs-neutral-800); font-size: var(--font-size-lg);">Please Review Your Trade Details</h4>
                            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: var(--spacing-3); font-size: var(--font-size-base);">
                                <div>
                                    <span style="color: var(--gs-neutral-600);">Company:</span>
                                    <span style="color: var(--gs-neutral-800); font-weight: 600; margin-left: var(--spacing-2);">${stock.name}</span>
                                </div>
                                <div>
                                    <span style="color: var(--gs-neutral-600);">Ticker:</span>
                                    <span style="color: var(--gs-neutral-800); font-weight: 600; margin-left: var(--spacing-2);">${tickerUpper}</span>
                                </div>
                                <div>
                                    <span style="color: var(--gs-neutral-600);">Share Price:</span>
                                    <span style="color: var(--gs-neutral-800); font-weight: 600; margin-left: var(--spacing-2);">${formatCurrency(stock.price, stockCurrency)}</span>
                                </div>
                                <div>
                                    <span style="color: var(--gs-neutral-600);">Number of Shares:</span>
                                    <span style="color: var(--gs-neutral-800); font-weight: 600; margin-left: var(--spacing-2);">${parseInt(shares).toLocaleString()}</span>
                                </div>
                                <div>
                                    <span style="color: var(--gs-neutral-600);">Trading Action:</span>
                                    <span style="color: var(--gs-neutral-800); font-weight: 600; margin-left: var(--spacing-2); ${trading_type === 'buy' ? 'color: #28a745;' : 'color: #dc3545;'}">${trading_type.toUpperCase()}</span>
                                </div>
                                <div>
                                    <span style="color: var(--gs-neutral-600);">Total Estimated Value:</span>
                                    <span style="color: var(--gs-neutral-800); font-weight: 600; font-size: var(--font-size-lg); margin-left: var(--spacing-2);">$${usdTotalValue.toLocaleString('en-US', {minimumFractionDigits: 2, maximumFractionDigits: 2})} USD${stockCurrency !== 'USD' ? ` (${formatCurrency(localTotalValue, stockCurrency)})` : ''}</span>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>

                <!-- Compliance Declaration -->
                <div class="card">
                    <div class="card-header">
                        <h3 class="card-title">📝 Compliance Declaration</h3>
                        <div style="font-size: var(--font-size-sm); color: var(--gs-neutral-600);">
                            Please read and confirm your agreement to proceed
                        </div>
                    </div>
                    <div class="card-body">
                        <form action="/submit-final-trade" method="POST">
                            <input type="hidden" name="ticker" value="${tickerUpper}">
                            <input type="hidden" name="shares" value="${shares}">
                            <input type="hidden" name="trading_type" value="${trading_type}">
                            <input type="hidden" name="price" value="${stock.price}">
                            <input type="hidden" name="company" value="${stock.name}">
                            <input type="hidden" name="currency" value="${stockCurrency}">
                            <input type="hidden" name="price_usd" value="${usdSharePrice}">
                            <input type="hidden" name="total_value" value="${localTotalValue}">
                            <input type="hidden" name="total_value_usd" value="${usdTotalValue}">
                            <input type="hidden" name="exchange_rate" value="${exchangeRate}">
                            
                            <div class="compliance-declaration">
                                <div class="declaration-content">
                                    <p style="margin-bottom: var(--spacing-4); font-weight: 500;">I have read the Company's Personal Dealing Policy and believe that the above transaction(s) comply with its requirements. I declare that:</p>
                                    <ul style="margin: var(--spacing-4) 0; padding-left: var(--spacing-6);">
                                        <li style="margin-bottom: var(--spacing-3);"><strong>(i)</strong> I will not buy or sell the investment(s) listed above on a day in which the Company has a pending "buy" or "sell" order in the same investment(s) until that order is executed or withdrawn;</li>
                                        <li style="margin-bottom: var(--spacing-3);"><strong>(ii)</strong> I will not buy or sell the investment(s) listed above within one trading day before (where I am aware of a forthcoming client transaction) or after trading in those investment(s) on behalf of a client unless the client order(s) have been fully executed and any conflicts of interest have been removed;</li>
                                        <li style="margin-bottom: var(--spacing-3);"><strong>(iii)</strong> I will not buy or sell the investment(s) listed above within one trading day before (where I am aware of a forthcoming recommendation) or after a recommendation on those investment(s) is made or proposed by the Company unless the client order(s) have been fully executed and any conflicts of interest have been removed;</li>
                                        <li style="margin-bottom: var(--spacing-3);"><strong>(iv)</strong> the requested investment(s) will not result in a misuse of inside information or in any conflict of interest or impropriety with regards to any client.</li>
                                    </ul>
                                    
                                    <div class="important-notes" style="background: #f8f9fa; border: 1px solid #dee2e6; border-radius: var(--radius); padding: var(--spacing-4); margin: var(--spacing-4) 0;">
                                        <h5 style="margin: 0 0 var(--spacing-3) 0; color: var(--gs-neutral-800);">Important Notes:</h5>
                                        <div style="margin-bottom: var(--spacing-2);">
                                            <strong>Market Orders:</strong> Permission is effective only on the trading day you receive approval.
                                        </div>
                                        <div style="margin-bottom: var(--spacing-2);">
                                            <strong>Limit Price Orders:</strong> Permission is effective for five (5) trading days including the trading day you receive approval.
                                        </div>
                                        <div>
                                            <strong>Holding Requirement:</strong> Relevant Persons must hold all personal investments for at least 30 calendar days as required pursuant to the FMCC (SFC).
                                        </div>
                                    </div>
                                </div>
                                
                                <div class="form-group" style="margin: var(--spacing-6) 0;">
                                    <label style="display: flex; align-items: flex-start; gap: var(--spacing-3); cursor: pointer;">
                                        <input type="checkbox" name="complianceAgreement" required style="margin-top: 2px; transform: scale(1.2);">
                                        <span style="font-weight: 500; color: var(--gs-neutral-800);">
                                            I have read and agree to the above declaration and compliance requirements. I understand that this trade request will be submitted for approval.
                                        </span>
                                    </label>
                                </div>
                            </div>
                            
                            <div style="margin-top: var(--spacing-8); text-align: center; display: flex; gap: var(--spacing-4); justify-content: center;">
                                <button type="submit" class="btn btn-primary" style="background: #28a745; padding: 15px 30px; font-size: 16px;">
                                    ✅ Submit Trade Request
                                </button>
                                <a href="/employee-dashboard" class="btn btn-secondary" style="padding: 15px 30px; font-size: 16px; text-decoration: none;">
                                    ← Back to Form
                                </a>
                            </div>
                        </form>
                    </div>
                </div>
            </main>
        </div>
    </body>
    </html>`;
    
    res.send(confirmationHTML);
    
  } catch (error) {
    console.error('Error in trade preview:', error);
    console.error('Error details:', error.message, error.stack);
    
    // More specific error handling
    if (error.message && error.message.includes('ticker')) {
      return res.redirect(`/employee-dashboard?error=${encodeURIComponent('Unable to validate ticker. Please try again.')}`);
    }
    
    // Generic error page
    const errorHTML = `
    <!DOCTYPE html>
    <html lang="en">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Error - Trading Portal</title>
        <link rel="stylesheet" href="/styles-modern.css">
    </head>
    <body>
        <div class="container">
            <div style="text-align: center; padding: 100px 20px;">
                <h1>Error Processing Request</h1>
                <p>We encountered an error while processing your trade preview.</p>
                <p>Please try again or contact support if the issue persists.</p>
                <a href="/employee-dashboard" class="btn btn-primary" style="margin-top: 20px;">Back to Dashboard</a>
            </div>
        </div>
    </body>
    </html>`;
    
    res.status(500).send(errorHTML);
  }
});

// Escalation form route
app.post('/escalate-request', async (req, res) => {
  // Check authentication
  if (!req.session.employee || !req.session.employee.email) {
    return res.redirect('/?error=authentication_required');
  }
  
  try {
    const { requestId } = req.body;
    const TradingRequest = require('./models/TradingRequest');
    
    // Get the request details
    const request = await TradingRequest.getById(requestId);
    if (!request) {
      return res.status(404).send('Request not found');
    }
    
    // Verify it belongs to the current employee
    if (request.employee_email.toLowerCase() !== req.session.employee.email.toLowerCase()) {
      return res.status(403).send('Access denied');
    }
    
    // Show escalation form
    const escalationFormHTML = `
    <!DOCTYPE html>
    <html lang="en">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Escalate Request - Inspiration Capital Management Limited</title>
        <link rel="stylesheet" href="styles-modern.css">
    </head>
    <body>
        <div class="container">
            <header>
                <div class="header-content">
                    <div>
                        <h1>Trading Compliance Portal</h1>
                        <div class="header-subtitle">Pre-Trading Approval & Risk Management System</div>
                    </div>
                </div>
            </header>
            
            <nav style="display: flex; gap: var(--spacing-4); padding: var(--spacing-4); background: var(--gs-neutral-200); border-radius: var(--radius); margin-bottom: var(--spacing-6);">
                <a href="/employee-dashboard" class="btn btn-secondary" style="text-decoration: none;">Submit Request</a>
                <a href="/employee-history" class="btn btn-secondary" style="text-decoration: none;">Request History</a>
                <a href="/employee-logout" class="btn btn-secondary" style="text-decoration: none;">Logout</a>
            </nav>
            
            <main>
                <!-- Request Summary -->
                <div class="card" style="margin-bottom: var(--spacing-6);">
                    <div class="card-header">
                        <h3 class="card-title">📋 Request Summary</h3>
                    </div>
                    <div class="card-body">
                        <div style="background: var(--gs-neutral-200); border: 1px solid var(--gs-neutral-400); border-radius: var(--radius); padding: var(--spacing-4);">
                            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: var(--spacing-3); font-size: var(--font-size-sm);">
                                <div><strong>Request ID:</strong> ${request.id}</div>
                                <div><strong>Status:</strong> <span style="color: #dc3545;">DECLINED</span></div>
                                <div><strong>Company:</strong> ${request.stock_name}</div>
                                <div><strong>Ticker:</strong> ${request.ticker}</div>
                                <div><strong>Shares:</strong> ${parseInt(request.shares).toLocaleString()}</div>
                                <div><strong>Type:</strong> ${request.trading_type.toUpperCase()}</div>
                            </div>
                        </div>
                    </div>
                </div>

                <!-- Escalation Form -->
                <div class="card">
                    <div class="card-header">
                        <h3 class="card-title">📤 Escalate to Manager</h3>
                        <div style="font-size: var(--font-size-sm); color: var(--gs-neutral-600);">
                            Provide business justification for manual review
                        </div>
                    </div>
                    <div class="card-body">
                        <form action="/submit-escalation" method="POST">
                            <input type="hidden" name="requestId" value="${requestId}">
                            
                            <div class="form-group">
                                <label class="form-label blue-label" for="escalationReason">Business Justification</label>
                                <textarea id="escalationReason" name="escalationReason" class="form-control" 
                                          rows="6" required placeholder="Please provide detailed business reasons for why this trade should be approved despite being on the restricted list. Include relevant business context, client requirements, or exceptional circumstances."
                                          style="width: 100%; min-height: 120px; margin-top: var(--spacing-2);"></textarea>
                            </div>
                            
                            <div style="background: #f8f9fa; border: 1px solid #dee2e6; border-radius: var(--radius); padding: var(--spacing-4); margin: var(--spacing-4) 0;">
                                <h5 style="margin: 0 0 var(--spacing-2) 0; color: var(--gs-neutral-800);">Please Note:</h5>
                                <ul style="margin: 0; padding-left: var(--spacing-4); font-size: var(--font-size-sm);">
                                    <li>This request will be sent to management for manual review</li>
                                    <li>Status will change to "PENDING" while under review</li>
                                    <li>Provide clear business justification to improve approval chances</li>
                                    <li>Escalated requests typically take 1-2 business days for review</li>
                                </ul>
                            </div>
                            
                            <div style="margin-top: var(--spacing-6); text-align: center;">
                                <button type="submit" class="btn btn-primary" style="background: #17a2b8; padding: 15px 30px; font-size: 16px;">
                                    📤 Submit Escalation
                                </button>
                                <a href="/employee-history" class="btn btn-secondary" style="padding: 15px 30px; font-size: 16px; text-decoration: none; margin-left: 20px;">
                                    Cancel
                                </a>
                            </div>
                        </form>
                    </div>
                </div>
            </main>
        </div>
    </body>
    </html>`;
    
    res.send(escalationFormHTML);
    
  } catch (error) {
    console.error('Error showing escalation form:', error);
    res.status(500).send('Error loading escalation form');
  }
});

// Submit escalation route
app.post('/submit-escalation', requireEmployee, async (req, res) => {
  
  try {
    const { requestId, escalationReason } = req.body;
    const TradingRequest = require('./models/TradingRequest');
    
    // Validate input
    if (!escalationReason || escalationReason.trim().length < 10) {
      return res.status(400).send('Please provide a detailed business justification (minimum 10 characters)');
    }
    
    // Get the request to verify ownership
    const request = await TradingRequest.getById(requestId);
    if (!request || request.employee_email.toLowerCase() !== req.session.employee.email.toLowerCase()) {
      return res.status(403).send('Access denied');
    }
    
    // Escalate the request
    await TradingRequest.escalate(requestId, escalationReason.trim());
    
    // Log escalation in audit trail
    const AuditLog = require('./models/AuditLog');
    await AuditLog.logActivity(
      req.session.employee.email,
      'employee',
      'escalate_trading_request',
      'trading_request',
      requestId,
      JSON.stringify({
        ticker: request.ticker,
        shares: request.shares,
        trading_type: request.trading_type,
        business_reason: escalationReason.trim(),
        original_status: 'rejected',
        new_status: 'pending'
      }),
      req.ip,
      req.get('User-Agent'),
      req.sessionID
    );
    
    console.log(`Request ${requestId} escalated by ${req.session.employee.email}`);
    
    // Show success page
    const successHTML = `
    <!DOCTYPE html>
    <html lang="en">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Escalation Submitted - Inspiration Capital Management Limited</title>
        <link rel="stylesheet" href="styles-modern.css">
    </head>
    <body>
        <div class="container">
            <header>
                <div class="header-content">
                    <div>
                        <h1>Trading Compliance Portal</h1>
                        <div class="header-subtitle">Pre-Trading Approval & Risk Management System</div>
                    </div>
                </div>
            </header>
            
            <main>
                <div class="card">
                    <div class="card-header">
                        <h3 class="card-title">📤 Escalation Submitted</h3>
                    </div>
                    <div class="card-body">
                        <div style="background: #d1ecf1; border: 1px solid #b8daff; color: #0c5460; padding: var(--spacing-4); border-radius: var(--radius); margin: var(--spacing-4) 0;">
                            <h4 style="margin: 0 0 var(--spacing-2) 0;">✅ Escalation Successful!</h4>
                            <p style="margin: 0; font-size: var(--font-size-sm);">
                                Your trading request has been escalated to management for manual review. The status has been changed to PENDING.
                            </p>
                        </div>
                        
                        <div style="background: var(--gs-neutral-200); border: 1px solid var(--gs-neutral-400); border-radius: var(--radius); padding: var(--spacing-4); margin: var(--spacing-4) 0;">
                            <h4 style="margin: 0 0 var(--spacing-3) 0; color: var(--gs-neutral-800);">What happens next:</h4>
                            <ul style="margin: 0; padding-left: var(--spacing-4); font-size: var(--font-size-sm);">
                                <li>Your request is now in the management review queue</li>
                                <li>Status has been updated to "PENDING"</li>
                                <li>Management will review your business justification</li>
                                <li>You will be notified of the decision within 1-2 business days</li>
                                <li>Check "Request History" to monitor status updates</li>
                            </ul>
                        </div>
                        
                        <div style="margin-top: var(--spacing-6); text-align: center;">
                            <a href="/employee-dashboard" class="btn btn-primary" style="padding: 15px 30px; font-size: 16px; text-decoration: none; margin-right: 20px;">
                                ← Back to Dashboard
                            </a>
                            <a href="/employee-history" class="btn btn-secondary" style="padding: 15px 30px; font-size: 16px; text-decoration: none;">
                                View Request History
                            </a>
                        </div>
                    </div>
                </div>
            </main>
        </div>
    </body>
    </html>`;
    
    res.send(successHTML);
    
  } catch (error) {
    console.error('Error submitting escalation:', error);
    console.error('Error stack:', error.stack);
    res.status(500).send(`Error processing escalation: ${error.message}`);
  }
});

// Handle final trade submission
app.post('/submit-final-trade', async (req, res) => {
  const { 
    ticker, shares, trading_type, price, company, complianceAgreement,
    currency, price_usd, total_value, total_value_usd, exchange_rate 
  } = req.body;
  
  try {
    // Check authentication
    if (!req.session.employee || !req.session.employee.email) {
      return res.redirect('/?error=authentication_required');
    }
    
    // Check compliance agreement
    if (!complianceAgreement) {
      return res.status(400).send('Compliance agreement is required');
    }
    
    // Import the required models
    const TradingRequest = require('./models/TradingRequest');
    const RestrictedStock = require('./models/RestrictedStock');
    
    // Check if stock is in restricted list
    const restrictedStocks = await RestrictedStock.getAll();
    console.log('=== RESTRICTION CHECK DEBUG ===');
    console.log('Submitted ticker:', ticker);
    console.log('Restricted stocks in database:', restrictedStocks.map(s => s.ticker));
    const isRestricted = restrictedStocks.some(stock => stock.ticker === ticker.toUpperCase());
    console.log('Is', ticker, 'restricted?', isRestricted);
    
    // Determine initial status based on restriction
    const initialStatus = isRestricted ? 'rejected' : 'approved';
    console.log('Initial status will be:', initialStatus);
    
    
    // Create the trading request with currency information
    const requestData = {
      employee_email: req.session.employee.email,
      stock_name: company,
      ticker: ticker,
      shares: parseInt(shares),
      trading_type: trading_type,
      share_price: parseFloat(price),
      total_value: parseFloat(total_value) || (parseFloat(price) * parseInt(shares)),
      currency: currency || 'USD',
      share_price_usd: parseFloat(price_usd) || parseFloat(price),
      total_value_usd: parseFloat(total_value_usd) || (parseFloat(price) * parseInt(shares)),
      exchange_rate: parseFloat(exchange_rate) || 1.0,
      estimated_value: parseFloat(total_value_usd) || (parseFloat(price) * parseInt(shares)) // Keep for backwards compatibility
    };
    
    const result = await TradingRequest.create(requestData);
    console.log('Created request with ID:', result.id);
    
    // Update status based on restriction check
    if (initialStatus === 'approved') {
      console.log('Updating status to approved for ID:', result.id);
      const updateResult = await TradingRequest.updateStatus(result.id, 'approved', 'Approved');
      console.log('Update result:', updateResult);
      result.status = 'approved';
    } else if (initialStatus === 'rejected') {
      console.log('Updating status to rejected for ID:', result.id);
      await TradingRequest.updateStatus(result.id, 'rejected', 'Declined');
      result.status = 'rejected';
    }
    
    // Generate success page
    const successHTML = `
    <!DOCTYPE html>
    <html lang="en">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Request Submitted - Inspiration Capital Management Limited</title>
        <link rel="stylesheet" href="styles-modern.css">
    </head>
    <body>
        <div class="container">
            <header>
                <div class="header-content">
                    <div>
                        <h1>Trading Compliance Portal</h1>
                        <div class="header-subtitle">Pre-Trading Approval & Risk Management System</div>
                    </div>
                </div>
            </header>
            
            <main>
                <div class="card">
                    <div class="card-header">
                        <h3 class="card-title">${result.status === 'approved' ? '✅ Request Approved' : result.status === 'rejected' ? '❌ Request Declined' : '⏳ Request Submitted'}</h3>
                    </div>
                    <div class="card-body">
                        <div style="background: ${result.status === 'approved' ? '#d4edda' : result.status === 'rejected' ? '#f8d7da' : '#fff3cd'}; border: 1px solid ${result.status === 'approved' ? '#c3e6cb' : result.status === 'rejected' ? '#f5c6cb' : '#ffeaa7'}; color: ${result.status === 'approved' ? '#155724' : result.status === 'rejected' ? '#721c24' : '#856404'}; padding: var(--spacing-4); border-radius: var(--radius); margin: var(--spacing-4) 0;">
                            <h4 style="margin: 0 0 var(--spacing-2) 0;">${result.status === 'approved' ? '✅ Request Approved!' : result.status === 'rejected' ? '❌ Request Declined!' : '⏳ Request Submitted!'}</h4>
                            <p style="margin: 0; font-size: var(--font-size-sm);">
                                ${result.status === 'approved' 
                                  ? 'Your trading request has been approved and you may proceed with the trade.' 
                                  : result.status === 'rejected'
                                  ? 'Your trading request has been declined. This stock is not available for trading.'
                                  : 'Your trading request has been submitted and is pending review.'}
                            </p>
                        </div>
                        
                        <div style="background: var(--gs-neutral-200); border: 1px solid var(--gs-neutral-400); border-radius: var(--radius); padding: var(--spacing-4); margin: var(--spacing-4) 0;">
                            <h4 style="margin: 0 0 var(--spacing-3) 0; color: var(--gs-neutral-800);">Request Details:</h4>
                            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: var(--spacing-2); font-size: var(--font-size-sm);">
                                <div><strong>Request ID:</strong> ${result.id}</div>
                                <div><strong>Status:</strong> ${result.status.toUpperCase()}</div>
                                <div><strong>Company:</strong> ${company}</div>
                                <div><strong>Ticker:</strong> ${ticker}</div>
                                <div><strong>Shares:</strong> ${parseInt(shares).toLocaleString()}</div>
                                <div><strong>Action:</strong> ${trading_type.toUpperCase()}</div>
                            </div>
                        </div>
                        
                        <div style="margin-top: var(--spacing-6); text-align: center;">
                            ${result.status === 'rejected' ? `
                                <div style="margin-bottom: var(--spacing-4);">
                                    <form action="/escalate-request" method="POST" style="display: inline-block; margin-right: 20px;">
                                        <input type="hidden" name="requestId" value="${result.id}">
                                        <button type="submit" class="btn btn-primary" style="background: #17a2b8; padding: 15px 30px; font-size: 16px;">
                                            📤 Escalate Request
                                        </button>
                                    </form>
                                </div>
                            ` : ''}
                            <a href="/employee-dashboard" class="btn btn-primary" style="padding: 15px 30px; font-size: 16px; text-decoration: none; margin-right: 20px;">
                                ← Back to Dashboard
                            </a>
                            <a href="/employee-history" class="btn btn-secondary" style="padding: 15px 30px; font-size: 16px; text-decoration: none;">
                                View Request History
                            </a>
                        </div>
                    </div>
                </div>
            </main>
        </div>
    </body>
    </html>`;
    
    res.send(successHTML);
    
  } catch (error) {
    console.error('Error submitting trade:', error);
    res.status(500).send('Error processing trade submission');
  }
});

// Employee history page (server-side)
app.get('/employee-history', requireEmployee, async (req, res) => {
  
  try {
    const TradingRequest = require('./models/TradingRequest');
    
    // Get filter parameters from query string
    const { start_date, end_date, ticker, trading_type } = req.query;
    
    // Get filtered requests for this employee
    let requests;
    if (start_date || end_date || ticker || trading_type) {
      // Apply filters
      requests = await TradingRequest.getFilteredHistory({
        employee_email: req.session.employee.email,
        start_date: start_date || null,
        end_date: end_date || null,
        ticker: ticker || null,
        trading_type: trading_type || null
      });
    } else {
      // Get all requests for this employee
      requests = await TradingRequest.findByEmail(req.session.employee.email);
    }
    
    // Generate table rows
    let tableRows = '';
    if (requests.length === 0) {
      tableRows = '<tr><td colspan="8" style="text-align: center; padding: var(--spacing-6); color: var(--gs-neutral-600);">No trading requests found</td></tr>';
    } else {
      tableRows = requests.map(request => {
        // Debug: log the raw database value
        console.log('Raw DB created_at:', request.created_at);
        console.log('New Date(created_at):', new Date(request.created_at).toISOString());
        
        const date = formatHongKongTime(new Date(request.created_at), true);
        console.log('Formatted HK time:', date);
        const statusColor = request.status === 'approved' ? '#28a745' : 
                           request.status === 'rejected' ? '#dc3545' : '#ffc107';
        
        const statusText = request.status.toUpperCase() + (request.escalated ? ' (ESCALATED)' : '');
        
        return `
          <tr style="${request.escalated ? 'background-color: #f8f9fa;' : ''}">
            <td style="text-align: center;">${request.id}</td>
            <td style="text-align: center;">${date}</td>
            <td>${request.stock_name || 'N/A'}</td>
            <td style="text-align: center; font-weight: 600;">${request.ticker}</td>
            <td style="text-align: center;">${request.trading_type.toUpperCase()}</td>
            <td style="text-align: center;">${parseInt(request.shares).toLocaleString()}</td>
            <td style="text-align: center;">
              $${parseFloat(request.total_value_usd || request.estimated_value || 0).toLocaleString('en-US', {minimumFractionDigits: 2})}
              ${request.currency && request.currency !== 'USD' ? `<br><span style="font-size: var(--font-size-xs); color: var(--gs-neutral-500);">(${formatCurrency(parseFloat(request.total_value || request.estimated_value || 0), request.currency)})</span>` : ''}
            </td>
            <td style="text-align: center;">
              <span style="background: ${statusColor}; color: white; padding: 4px 8px; border-radius: 4px; font-size: var(--font-size-xs); font-weight: 500;">
                ${statusText}
              </span>
            </td>
          </tr>
        `;
      }).join('');
    }
    
    const historyHTML = `
    <!DOCTYPE html>
    <html lang="en">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Request History - Inspiration Capital Management Limited</title>
        <link rel="stylesheet" href="styles-modern.css">
    </head>
    <body>
        <div class="container">
            <header>
                <div class="header-content">
                    <div>
                        <h1>Trading Compliance Portal</h1>
                        <div class="header-subtitle">Inspiration Capital Management Limited</div>
                        <div style="font-size: var(--font-size-sm); color: var(--gs-neutral-500); margin-top: var(--spacing-1);">Pre-Trading Approval & Risk Management System</div>
                    </div>
                </div>
            </header>
            
            <nav style="display: flex; gap: var(--spacing-4); padding: var(--spacing-4); background: var(--gs-neutral-200); border-radius: var(--radius); margin-bottom: var(--spacing-6);">
                <a href="/employee-dashboard" class="btn btn-secondary" style="text-decoration: none;">Submit Request</a>
                <a href="/employee-history" class="btn btn-primary" style="text-decoration: none;">Request History</a>
                <a href="/employee-logout" class="btn btn-secondary" style="text-decoration: none;">Logout</a>
            </nav>
            
            <main>
                <!-- Filter/Export Controls -->
                <div style="margin-bottom: var(--spacing-4); padding: var(--spacing-4); background: var(--gs-neutral-200); border-radius: var(--radius); border: 1px solid var(--gs-neutral-300);">
                    <h4 style="margin: 0 0 var(--spacing-3) 0; font-size: var(--font-size-sm); font-weight: 600; color: var(--gs-dark-blue);">📊 Filter & Export Your Trading History</h4>
                    <form id="filter-form" style="display: flex; flex-wrap: wrap; gap: var(--spacing-3); align-items: end;">
                        <div class="form-group" style="margin: 0; min-width: 140px;">
                            <label class="form-label" style="margin-bottom: var(--spacing-1); font-size: var(--font-size-xs);">Start Date</label>
                            <input type="date" name="start_date" class="form-control compact" value="${start_date || ''}">
                        </div>
                        <div class="form-group" style="margin: 0; min-width: 140px;">
                            <label class="form-label" style="margin-bottom: var(--spacing-1); font-size: var(--font-size-xs);">End Date</label>
                            <input type="date" name="end_date" class="form-control compact" value="${end_date || ''}">
                        </div>
                        <div class="form-group" style="margin: 0; min-width: 120px;">
                            <label class="form-label" style="margin-bottom: var(--spacing-1); font-size: var(--font-size-xs);">Ticker</label>
                            <input type="text" name="ticker" class="form-control compact" placeholder="e.g., AAPL" value="${ticker || ''}" maxlength="15">
                        </div>
                        <div class="form-group" style="margin: 0; min-width: 100px;">
                            <label class="form-label" style="margin-bottom: var(--spacing-1); font-size: var(--font-size-xs);">Action</label>
                            <select name="trading_type" class="form-control compact">
                                <option value="">All Actions</option>
                                <option value="buy"${trading_type === 'buy' ? ' selected' : ''}>BUY</option>
                                <option value="sell"${trading_type === 'sell' ? ' selected' : ''}>SELL</option>
                            </select>
                        </div>
                        <div style="display: flex; gap: var(--spacing-2);">
                            <button type="submit" formaction="/employee-history" class="btn btn-secondary" style="margin: 0;">👁️ Show Results</button>
                            <button type="submit" formaction="/employee-export-history" class="btn btn-primary" style="margin: 0;">📥 Export CSV</button>
                            ${(start_date || end_date || ticker || trading_type) ? 
                              '<a href="/employee-history" class="btn btn-outline" style="margin: 0; text-decoration: none;">✕ Clear Filters</a>' : ''}
                        </div>
                    </form>
                </div>
                    
                <div class="card">
                    <div class="card-header">
                        <h3 class="card-title">Your Trading Request History</h3>
                        <div style="font-size: var(--font-size-sm); color: var(--gs-neutral-600);">
                            ${req.session.employee.name} (${req.session.employee.email}) | 
                            ${(start_date || end_date || ticker || trading_type) ? 
                              `Filtered Results: ${requests.length} requests` + 
                              (start_date ? ` | From: ${start_date}` : '') +
                              (end_date ? ` | To: ${end_date}` : '') +
                              (ticker ? ` | Ticker: ${ticker.toUpperCase()}` : '') +
                              (trading_type ? ` | Action: ${trading_type.toUpperCase()}` : '') :
                              `Total Requests: ${requests.length}`
                            }
                        </div>
                    </div>
                    <div class="card-body">
                        <div class="table-container">
                            <table class="modern-table">
                                <thead>
                                    <tr>
                                        <th>Request ID</th>
                                        <th>Date & Time (HK)</th>
                                        <th>Company</th>
                                        <th>Ticker</th>
                                        <th>Action</th>
                                        <th>Shares</th>
                                        <th>Est. Value (USD)</th>
                                        <th>Status</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    ${tableRows}
                                </tbody>
                            </table>
                        </div>
                    </div>
                </div>
            </main>
        </div>
    </body>
    </html>`;
    
    res.send(historyHTML);
    
  } catch (error) {
    console.error('Error loading employee history:', error);
    res.status(500).send('Error loading request history');
  }
});

// Employee export history route
app.get('/employee-export-history', requireEmployee, async (req, res) => {
  
  try {
    const TradingRequest = require('./models/TradingRequest');
    
    // Get filter parameters from query string
    const { start_date, end_date, ticker, trading_type } = req.query;
    
    // Get filtered requests for this employee
    const filters = {
      employee_email: req.session.employee.email,
      start_date: start_date || null,
      end_date: end_date || null,
      ticker: ticker || null,
      trading_type: trading_type || null
    };
    
    const requests = await TradingRequest.getFilteredHistory(filters);
    
    // Generate CSV content
    const csvHeaders = 'Request ID,Date & Time (HK),Company,Ticker,Action,Shares,Share Price USD,Total Value USD,Currency,Status,Created At\n';
    const csvRows = requests.map(request => {
      const date = formatExcelDateTime(new Date(request.created_at));
      const sharePrice = parseFloat(request.share_price_usd || request.share_price || 0).toFixed(2);
      const totalValue = parseFloat(request.total_value_usd || request.estimated_value || 0).toFixed(2);
      
      return [
        request.id,
        date,
        `"${(request.stock_name || 'N/A').replace(/"/g, '""')}"`,
        request.ticker,
        request.trading_type.toUpperCase(),
        request.shares,
        sharePrice,
        totalValue,
        request.currency || 'USD',
        request.status.toUpperCase(),
        request.created_at
      ].join(',');
    }).join('\n');
    
    const csvContent = csvHeaders + csvRows;
    
    // Generate filename with filters
    let filterSuffix = '';
    if (start_date || end_date || ticker || trading_type) {
      const parts = [];
      if (start_date) parts.push(`from-${start_date}`);
      if (end_date) parts.push(`to-${end_date}`);
      if (ticker) parts.push(`ticker-${ticker.toUpperCase()}`);
      if (trading_type) parts.push(`action-${trading_type.toUpperCase()}`);
      filterSuffix = '-' + parts.join('-');
    }
    
    const timestamp = new Date().toISOString().slice(0, 19).replace(/[:.]/g, '-');
    const employeeId = req.session.employee.email.split('@')[0];
    
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="my-trading-history${filterSuffix}-${employeeId}-${timestamp}.csv"`);
    res.send(csvContent);
    
  } catch (error) {
    console.error('Error exporting employee history:', error);
    res.status(500).send('Error exporting trading history');
  }
});

// Admin restricted stocks management page
app.get('/admin-restricted-stocks', requireAdmin, async (req, res) => {
  
  try {
    const RestrictedStock = require('./models/RestrictedStock');
    const stocks = await RestrictedStock.getAll();
    
    // Generate table rows
    const tableRows = stocks.map(stock => `
        <tr>
          <td style="text-align: center; font-weight: 600;">${stock.ticker}</td>
          <td>${stock.company_name || 'N/A'}</td>
          <td style="text-align: center;">${formatHongKongTime(new Date(stock.created_at))}</td>
          <td style="text-align: center;">
            <form action="/admin-remove-stock" method="POST" style="display: inline;">
              <input type="hidden" name="ticker" value="${stock.ticker}">
              <button type="submit" class="btn btn-danger" style="padding: 4px 8px; font-size: var(--font-size-xs);" 
                      onclick="return confirm('Remove ${stock.ticker} from restricted list?')">Remove</button>
            </form>
          </td>
        </tr>
      `);
    
    const addStockCard = renderCard('Add New Restricted Stock', `
        <p style="margin: 0 0 var(--spacing-4) 0; color: var(--gs-neutral-600); font-size: var(--font-size-sm);">
            Supported formats: US stocks (AAPL), Hong Kong (.HK), European exchanges (.AS, .DE, .L), Chinese A-shares (6 digits)
        </p>
        <form action="/admin-add-stock" method="POST">
            <div class="form-group inline">
                <label class="form-label blue-label" for="ticker">Stock Ticker</label>
                <input type="text" id="ticker" name="ticker" class="form-control compact" placeholder="e.g., AAPL, 0001.HK, SAP.DE" required maxlength="15" style="margin-right: var(--spacing-3);">
                <button type="submit" class="btn btn-primary">Add to Restricted List</button>
            </div>
        </form>
    `);
    
    const stocksTableCard = `
        <div class="card">
            <div class="card-header">
                <h3 class="card-title">Current Restricted Stocks</h3>
                <div style="margin-top: var(--spacing-3); display: flex; gap: var(--spacing-3);">
                    <a href="/admin-export-restricted-stocks-changelog" class="btn btn-secondary" style="text-decoration: none; font-size: var(--font-size-sm);">📊 Export Changelog</a>
                    <form action="/admin-update-stock-names" method="POST" style="display: inline;">
                        <button type="submit" class="btn btn-secondary" style="font-size: var(--font-size-sm);" onclick="return confirm('Update all company names for stocks showing \"Added via Admin Panel\"?')">🔄 Update Company Names</button>
                    </form>
                </div>
            </div>
            <div class="card-body">
                ${renderTable(['Ticker', 'Company Name', 'Date Added', 'Action'], tableRows, 'No restricted stocks found')}
            </div>
        </div>`;
    
    const content = `
        ${generateNotificationBanner(req.query)}
        ${addStockCard}
        ${stocksTableCard}
    `;
    
    const html = renderAdminPage('Restricted Stocks Management', content);
    res.send(html);
    
  } catch (error) {
    console.error('Error loading restricted stocks:', error);
    res.status(500).send('Error loading restricted stocks');
  }
});


// Helper function to get company name from ticker
// Basic ticker format validation (permissive - API will do real validation)
function isValidTicker(ticker) {
  // Remove any whitespace and convert to uppercase
  const cleanTicker = ticker.trim().toUpperCase();
  
  // Basic sanity checks only - let Yahoo Finance API do the real validation
  if (cleanTicker.length < 1 || cleanTicker.length > 20) {
    return false;
  }
  
  // Allow alphanumeric characters, dots, and hyphens
  return /^[A-Z0-9.\-]{1,20}$/.test(cleanTicker);
}

async function getCompanyName(ticker) {
  // Basic format validation first
  if (!isValidTicker(ticker)) {
    throw new Error(`Invalid ticker format: ${ticker}`);
  }
  
  // Use Yahoo Finance API to validate and get company info
  const yahooData = await validateTickerWithYahoo(ticker);
  
  if (yahooData.isValid) {
    return yahooData.longName || `${ticker} Corporation`;
  } else {
    throw new Error(`Invalid ticker: ${ticker} - ${yahooData.error || 'Not found'}`);
  }
}

// Admin add stock route
app.post('/admin-add-stock', requireAdmin, async (req, res) => {
  
  try {
    const { ticker } = req.body;
    
    if (!ticker || !ticker.trim()) {
      return res.redirect('/admin-restricted-stocks?error=ticker_required');
    }
    
    const RestrictedStock = require('./models/RestrictedStock');
    const AuditLog = require('./models/AuditLog');
    const RestrictedStockChangelog = require('./models/RestrictedStockChangelog');
    
    const tickerUpper = ticker.toUpperCase().trim();
    
    // Validate ticker format
    let companyName;
    try {
      companyName = await getCompanyName(tickerUpper);
    } catch (validationError) {
      console.error('Ticker validation failed:', validationError.message);
      return res.redirect(`/admin-restricted-stocks?error=invalid_ticker&ticker=${encodeURIComponent(ticker)}`);
    }
    
    // Check if stock already exists
    const existingStock = await RestrictedStock.getByTicker(tickerUpper);
    if (existingStock) {
      return res.redirect('/admin-restricted-stocks?error=stock_already_exists&ticker=' + encodeURIComponent(tickerUpper));
    }
    
    await RestrictedStock.add(tickerUpper, companyName, null);
    
    // Log the addition to audit log
    await AuditLog.logActivity(
      req.session.admin?.username || 'admin@company.com',
      'admin',
      'add_restricted_stock',
      'restricted_stock',
      tickerUpper,
      JSON.stringify({
        ticker: tickerUpper,
        company_name: companyName,
        action: 'added'
      }),
      req.ip,
      req.get('User-Agent'),
      req.sessionID
    );
    
    // Log to restricted stock changelog
    await RestrictedStockChangelog.logChange({
      ticker: tickerUpper,
      company_name: companyName,
      action: 'added',
      admin_email: req.session.admin?.username || 'admin@company.com',
      reason: 'Added via admin panel',
      ip_address: req.ip,
      user_agent: req.get('User-Agent'),
      session_id: req.sessionID
    });
    
    res.redirect(`/admin-restricted-stocks?message=stock_added&ticker=${encodeURIComponent(tickerUpper)}&company=${encodeURIComponent(companyName)}`);
    
  } catch (error) {
    console.error('Error adding restricted stock:', error);
    res.redirect('/admin-restricted-stocks?error=add_failed&details=' + encodeURIComponent(error.message));
  }
});

// Admin remove stock route
app.post('/admin-remove-stock', requireAdmin, async (req, res) => {
  
  try {
    const { ticker } = req.body;
    const RestrictedStock = require('./models/RestrictedStock');
    const AuditLog = require('./models/AuditLog');
    const RestrictedStockChangelog = require('./models/RestrictedStockChangelog');
    
    // Get stock details before removal for logging
    const stockToRemove = await RestrictedStock.getByTicker(ticker);
    
    await RestrictedStock.remove(ticker);
    
    // Log the removal to audit log
    if (stockToRemove) {
      await AuditLog.logActivity(
        req.session.admin?.username || 'admin@company.com',
        'admin',
        'remove_restricted_stock',
        'restricted_stock',
        ticker.toUpperCase(),
        JSON.stringify({
          ticker: ticker.toUpperCase(),
          company_name: stockToRemove.company_name,
          action: 'removed'
        }),
        req.ip,
        req.get('User-Agent'),
        req.sessionID
      );
      
      // Log to restricted stock changelog
      await RestrictedStockChangelog.logChange({
        ticker: ticker.toUpperCase(),
        company_name: stockToRemove.company_name,
        action: 'removed',
        admin_email: req.session.admin?.username || 'admin@company.com',
        reason: 'Removed via admin panel',
        ip_address: req.ip,
        user_agent: req.get('User-Agent'),
        session_id: req.sessionID
      });
    }
    
    res.redirect('/admin-restricted-stocks?message=stock_removed');
    
  } catch (error) {
    console.error('Error removing restricted stock:', error);
    res.redirect('/admin-restricted-stocks?error=remove_failed');
  }
});

// Admin export restricted stocks changelog route
app.get('/admin-export-restricted-stocks-changelog', requireAdmin, async (req, res) => {
  
  try {
    const AuditLog = require('./models/AuditLog');
    
    // Get all restricted stock related audit logs
    const changelog = await AuditLog.getAuditLogs({
      targetType: 'restricted_stock',
      limit: 1000
    });
    
    // Create CSV content
    let csvContent = 'Date,Admin,Action,Ticker,Company Name,IP Address\n';
    
    changelog.forEach(log => {
      const details = JSON.parse(log.details || '{}');
      const date = formatExcelDateTime(new Date(log.created_at));
      const action = log.action.replace('_restricted_stock', '').replace('_', ' ').toUpperCase();
      const ticker = details.ticker || log.target_id || '';
      const companyName = (details.company_name || '').replace(/"/g, '""'); // Escape quotes for CSV
      const ipAddress = log.ip_address || '';
      
      csvContent += `"${date}","${log.user_email}","${action}","${ticker}","${companyName}","${ipAddress}"\n`;
    });
    
    // Set headers for file download
    const timestamp = new Date().toISOString().split('T')[0];
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="restricted-stocks-changelog-${timestamp}.csv"`);
    
    res.send(csvContent);
    
  } catch (error) {
    console.error('Error exporting restricted stocks changelog:', error);
    res.status(500).send('Error exporting changelog');
  }
});

// Admin update existing restricted stocks with proper company names
app.post('/admin-update-stock-names', requireAdmin, async (req, res) => {
  
  try {
    const RestrictedStock = require('./models/RestrictedStock');
    
    // Get all stocks with 'Added via Admin Panel' as company name
    const stocks = await RestrictedStock.getAll();
    const stocksToUpdate = stocks.filter(stock => stock.company_name === 'Added via Admin Panel');
    
    let updatedCount = 0;
    
    for (const stock of stocksToUpdate) {
      try {
        const companyName = await getCompanyName(stock.ticker);
        
        const sql = 'UPDATE restricted_stocks SET company_name = $1 WHERE ticker = $2';
        const result = await database.run(sql, [companyName, stock.ticker]);
        updatedCount += result.changes;
      } catch (error) {
        console.error(`Error updating ${stock.ticker}:`, error);
        // Continue with other stocks even if one fails
      }
    }
    
    res.redirect(`/admin-restricted-stocks?message=updated_${updatedCount}_stocks`);
    
  } catch (error) {
    console.error('Error updating stock names:', error);
    res.redirect('/admin-restricted-stocks?error=update_failed');
  }
});

// Admin approve request route
app.post('/admin-approve-request', requireAdmin, async (req, res) => {
  
  try {
    const { requestId } = req.body;
    const TradingRequest = require('./models/TradingRequest');
    const AuditLog = require('./models/AuditLog');
    
    // Get request details for logging
    const request = await TradingRequest.getById(requestId);
    if (!request) {
      return res.status(404).send('Request not found');
    }
    
    await TradingRequest.updateStatus(requestId, 'approved');
    
    // Log approval decision in audit trail
    await AuditLog.logActivity(
      req.session.admin.username || 'admin',
      'admin',
      'approve_trading_request',
      'trading_request',
      requestId,
      JSON.stringify({
        ticker: request.ticker,
        shares: request.shares,
        trading_type: request.trading_type,
        employee_email: request.employee_email,
        was_escalated: !!request.escalated,
        escalation_reason: request.escalation_reason || null,
        previous_status: request.status,
        new_status: 'approved'
      }),
      req.ip,
      req.get('User-Agent'),
      req.sessionID
    );
    
    console.log(`Admin approved trading request ${requestId}`);
    res.redirect('/admin-requests?message=request_approved');
    
  } catch (error) {
    console.error('Error approving request:', error);
    res.redirect('/admin-requests?error=approval_failed');
  }
});

// Admin reject request route
app.post('/admin-reject-request', requireAdmin, async (req, res) => {
  
  try {
    const { requestId } = req.body;
    const TradingRequest = require('./models/TradingRequest');
    const AuditLog = require('./models/AuditLog');
    
    // Get request details for logging
    const request = await TradingRequest.getById(requestId);
    if (!request) {
      return res.status(404).send('Request not found');
    }
    
    await TradingRequest.updateStatus(requestId, 'rejected', 'Rejected');
    
    // Log rejection decision in audit trail
    await AuditLog.logActivity(
      req.session.admin.username || 'admin',
      'admin',
      'reject_trading_request',
      'trading_request',
      requestId,
      JSON.stringify({
        ticker: request.ticker,
        shares: request.shares,
        trading_type: request.trading_type,
        employee_email: request.employee_email,
        was_escalated: !!request.escalated,
        escalation_reason: request.escalation_reason || null,
        previous_status: request.status,
        new_status: 'rejected'
      }),
      req.ip,
      req.get('User-Agent'),
      req.sessionID
    );
    
    console.log(`Admin rejected trading request ${requestId}`);
    res.redirect('/admin-requests?message=request_rejected');
    
  } catch (error) {
    console.error('Error rejecting request:', error);
    res.redirect('/admin-requests?error=rejection_failed');
  }
});

// View escalation reason route
app.get('/view-escalation/:requestId', requireAdmin, async (req, res) => {
  
  try {
    const { requestId } = req.params;
    const TradingRequest = require('./models/TradingRequest');
    
    const request = await TradingRequest.getById(requestId);
    if (!request) {
      return res.status(404).send('Request not found');
    }
    
    if (!request.escalated || !request.escalation_reason) {
      return res.status(400).send('This request has not been escalated');
    }
    
    const escalationViewHTML = `
    <!DOCTYPE html>
    <html lang="en">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Escalation Details - Inspiration Capital Management Limited</title>
        <link rel="stylesheet" href="styles-modern.css">
    </head>
    <body>
        <div class="container">
            <header>
                <div class="header-content">
                    <div>
                        <h1>Trading Compliance Portal</h1>
                        <div class="header-subtitle">Inspiration Capital Management Limited</div>
                        <div style="font-size: var(--font-size-sm); color: var(--gs-neutral-500); margin-top: var(--spacing-1);">Administrator Dashboard</div>
                    </div>
                </div>
            </header>
            
            <nav style="display: flex; gap: var(--spacing-4); padding: var(--spacing-4); background: var(--gs-neutral-200); border-radius: var(--radius); margin-bottom: var(--spacing-6);">
                <a href="/admin-dashboard" class="btn btn-secondary" style="text-decoration: none;">Dashboard</a>
                <a href="/admin-restricted-stocks" class="btn btn-secondary" style="text-decoration: none;">Restricted Stocks</a>
                <a href="/admin-requests" class="btn btn-primary" style="text-decoration: none;">Trading Requests</a>
                <a href="/admin-logout" class="btn btn-secondary" style="text-decoration: none;">Logout</a>
            </nav>
            
            <main>
                <div class="card" style="margin-bottom: var(--spacing-6);">
                    <div class="card-header">
                        <h3 class="card-title">📋 Escalated Request #${request.id}</h3>
                        <p style="margin: var(--spacing-2) 0 0 0; color: var(--gs-neutral-600); font-size: var(--font-size-sm);">
                            Employee escalation request requiring manual review
                        </p>
                    </div>
                    <div class="card-body">
                        <div class="table-container">
                            <table class="modern-table">
                                <tbody>
                                    <tr>
                                        <td style="font-weight: 600; width: 150px;">Employee</td>
                                        <td>${request.employee_email}</td>
                                    </tr>
                                    <tr>
                                        <td style="font-weight: 600;">Escalated Date</td>
                                        <td>${formatHongKongTime(new Date(request.escalated_at), true)}</td>
                                    </tr>
                                    <tr>
                                        <td style="font-weight: 600;">Company</td>
                                        <td>${request.stock_name}</td>
                                    </tr>
                                    <tr>
                                        <td style="font-weight: 600;">Ticker</td>
                                        <td style="font-weight: 600;">${request.ticker}</td>
                                    </tr>
                                    <tr>
                                        <td style="font-weight: 600;">Trading Type</td>
                                        <td>${request.trading_type.toUpperCase()}</td>
                                    </tr>
                                    <tr>
                                        <td style="font-weight: 600;">Shares</td>
                                        <td>${parseInt(request.shares).toLocaleString()}</td>
                                    </tr>
                                    <tr>
                                        <td style="font-weight: 600;">Total Value</td>
                                        <td>$${parseFloat(request.total_value_usd || request.estimated_value || 0).toLocaleString('en-US', {minimumFractionDigits: 2})} USD</td>
                                    </tr>
                                </tbody>
                            </table>
                        </div>
                    </div>
                </div>
                
                <div class="card" style="margin-bottom: var(--spacing-6);">
                    <div class="card-header">
                        <h3 class="card-title">💼 Business Justification</h3>
                        <p style="margin: var(--spacing-2) 0 0 0; color: var(--gs-neutral-600); font-size: var(--font-size-sm);">
                            Employee's reason for requesting manual approval
                        </p>
                    </div>
                    <div class="card-body">
                        <div style="background: var(--gs-neutral-100); padding: var(--spacing-4); border-radius: var(--radius); border-left: 4px solid var(--color-primary);">
                            ${request.escalation_reason.replace(/\n/g, '<br>')}
                        </div>
                    </div>
                </div>
                
                <div class="card">
                    <div class="card-header">
                        <h3 class="card-title">⚖️ Administrative Decision</h3>
                        <p style="margin: var(--spacing-2) 0 0 0; color: var(--gs-neutral-600); font-size: var(--font-size-sm);">
                            Approve or reject this escalated trading request
                        </p>
                    </div>
                    <div class="card-body">
                        <div style="display: flex; gap: var(--spacing-4); justify-content: center; align-items: center;">
                            <form action="/admin-approve-request" method="POST" style="display: inline;">
                                <input type="hidden" name="requestId" value="${request.id}">
                                <button type="submit" class="btn btn-success" 
                                        onclick="return confirm('Approve this escalated trading request for ${request.ticker}?')">
                                    ✅ Approve Request
                                </button>
                            </form>
                            <form action="/admin-reject-request" method="POST" style="display: inline;">
                                <input type="hidden" name="requestId" value="${request.id}">
                                <button type="submit" class="btn btn-danger" 
                                        onclick="return confirm('Reject this escalated trading request for ${request.ticker}?')">
                                    ❌ Reject Request
                                </button>
                            </form>
                            <a href="/admin-requests" class="btn btn-secondary" style="text-decoration: none;">
                                ← Back to Requests
                            </a>
                        </div>
                    </div>
                </div>
            </main>
        </div>
    </body>
    </html>`;
    
    res.send(escalationViewHTML);
    
  } catch (error) {
    console.error('Error viewing escalation reason:', error);
    res.status(500).send('Error loading escalation details');
  }
});

// Helper function to get unique employee options for dropdown
async function getUniqueEmployeeOptions(selectedEmail = null) {
  try {
    const TradingRequest = require('./models/TradingRequest');
    const employees = await TradingRequest.getUniqueTeamMembers();
    return employees.map(email => 
      `<option value="${email}"${email === selectedEmail ? ' selected' : ''}>${email}</option>`
    ).join('');
  } catch (error) {
    console.error('Error getting unique employees:', error);
    return '';
  }
}

// Admin requests view page
app.get('/admin-requests', requireAdmin, async (req, res) => {
  
  try {
    const TradingRequest = require('./models/TradingRequest');
    
    // Get filter parameters from query string
    const { employee_email, start_date, end_date } = req.query;
    
    // Get filtered requests
    let requests;
    if (employee_email || start_date || end_date) {
      // Apply filters using existing getFilteredHistory method
      requests = await TradingRequest.getFilteredHistory({
        employee_email: employee_email || null,
        start_date: start_date || null,
        end_date: end_date || null
      });
    } else {
      // Get all requests
      requests = await TradingRequest.getAll();
    }
    
    // Generate table rows
    const tableRows = requests.map(request => {
      const date = formatHongKongTime(new Date(request.created_at));
      const statusColor = request.status === 'approved' ? '#28a745' : 
                         request.status === 'rejected' ? '#dc3545' : '#ffc107';
      
      const escalationBadge = request.escalated ? 
        '<span style="background: #17a2b8; color: white; padding: 2px 4px; border-radius: 3px; font-size: 10px; margin-left: 4px;">ESCALATED</span>' : '';
        
      return `
        <tr style="${request.escalated ? 'background-color: #f8f9fa;' : ''}">
          <td style="text-align: center;">${request.id}${escalationBadge}</td>
          <td style="text-align: center;">${date}</td>
          <td>${request.employee_email}</td>
          <td>${request.stock_name || 'N/A'}</td>
          <td style="text-align: center; font-weight: 600;">${request.ticker}</td>
          <td style="text-align: center;">${request.trading_type.toUpperCase()}</td>
          <td style="text-align: center;">${parseInt(request.shares).toLocaleString()}</td>
          <td style="text-align: center;">
            $${parseFloat(request.total_value_usd || request.estimated_value || 0).toLocaleString('en-US', {minimumFractionDigits: 2})}
            ${request.currency && request.currency !== 'USD' ? `<br><span style="font-size: var(--font-size-xs); color: var(--gs-neutral-500);">(${formatCurrency(parseFloat(request.total_value || request.estimated_value || 0), request.currency)})</span>` : ''}
          </td>
          <td style="text-align: center;">
            <span style="background: ${statusColor}; color: white; padding: 4px 8px; border-radius: 4px; font-size: var(--font-size-xs); font-weight: 500;">
              ${request.status.toUpperCase()}
            </span>
          </td>
          <td style="text-align: center;">
            ${request.status === 'pending' ? `
              ${request.escalated && request.escalation_reason ? `
                <div style="margin-bottom: 5px;">
                  <a href="/view-escalation/${request.id}" 
                     style="background: #17a2b8; color: white; border: none; padding: 2px 6px; border-radius: 3px; font-size: 10px; text-decoration: none; display: inline-block;">
                    📄 View Reason
                  </a>
                </div>
              ` : ''}
              <form action="/admin-approve-request" method="POST" style="display: inline-block; margin-right: 5px;">
                <input type="hidden" name="requestId" value="${request.id}">
                <button type="submit" class="btn btn-primary" style="padding: 2px 6px; font-size: var(--font-size-xs); background: #28a745;" 
                        onclick="return confirm('Approve trading request for ${request.ticker}?')">✓ Approve</button>
              </form>
              <form action="/admin-reject-request" method="POST" style="display: inline-block;">
                <input type="hidden" name="requestId" value="${request.id}">
                <button type="submit" class="btn btn-secondary" style="padding: 2px 6px; font-size: var(--font-size-xs); background: #dc3545; color: white;" 
                        onclick="return confirm('Reject trading request for ${request.ticker}?')">✗ Reject</button>
              </form>
            ` : '<span style="color: var(--gs-neutral-500); font-size: var(--font-size-xs);">No Action</span>'}
          </td>
        </tr>
      `;
    });
    
    const filterControls = `
        <div style="margin-bottom: var(--spacing-4); padding: var(--spacing-4); background: var(--gs-neutral-200); border-radius: var(--radius); border: 1px solid var(--gs-neutral-300);">
            <h4 style="margin: 0 0 var(--spacing-3) 0; font-size: var(--font-size-sm); font-weight: 600; color: var(--gs-dark-blue);">📊 Filter & Export Trading Requests</h4>
            <form id="filter-form" style="display: flex; flex-wrap: wrap; gap: var(--spacing-3); align-items: end;">
                <div class="form-group" style="margin: 0; min-width: 200px;">
                    <label class="form-label" style="margin-bottom: var(--spacing-1); font-size: var(--font-size-xs);">Employee (Optional)</label>
                    <select name="employee_email" class="form-control compact">
                        <option value="">All Employees</option>
                        ${await getUniqueEmployeeOptions(employee_email)}
                    </select>
                </div>
                <div class="form-group" style="margin: 0; min-width: 140px;">
                    <label class="form-label" style="margin-bottom: var(--spacing-1); font-size: var(--font-size-xs);">Start Date</label>
                    <input type="date" name="start_date" class="form-control compact" value="${start_date || ''}">
                </div>
                <div class="form-group" style="margin: 0; min-width: 140px;">
                    <label class="form-label" style="margin-bottom: var(--spacing-1); font-size: var(--font-size-xs);">End Date</label>
                    <input type="date" name="end_date" class="form-control compact" value="${end_date || ''}">
                </div>
                <div style="display: flex; gap: var(--spacing-2);">
                    <button type="submit" formaction="/admin-requests" class="btn btn-secondary" style="margin: 0;">👁️ Show Results</button>
                    <button type="submit" formaction="/admin-export-trading-requests" class="btn btn-primary" style="margin: 0;">📥 Export CSV</button>
                    ${(employee_email || start_date || end_date) ? 
                      '<a href="/admin-requests" class="btn btn-outline" style="margin: 0; text-decoration: none;">✕ Clear Filters</a>' : ''}
                </div>
            </form>
        </div>
    `;
    
    const requestsTable = renderCard('Trading Requests', renderTable(
      ['Request ID', 'Date', 'Employee', 'Company', 'Ticker', 'Type', 'Shares', 'Est. Value (USD)', 'Status', 'Actions'],
      tableRows,
      'No trading requests found'
    ));
    
    const content = `
        ${filterControls}
        ${requestsTable}
    `;
    
    const html = renderAdminPage('Trading Requests', content);
    res.send(html);
    
  } catch (error) {
    console.error('Error loading admin requests:', error);
    res.status(500).send('Error loading trading requests');
  }
});

// Admin export trading requests route
app.get('/admin-export-trading-requests', requireAdmin, async (req, res) => {
  
  try {
    const TradingRequest = require('./models/TradingRequest');
    const { employee_email, start_date, end_date } = req.query;
    
    // Build filters object
    const filters = {};
    if (employee_email) filters.employee_email = employee_email;
    if (start_date) filters.start_date = start_date;
    if (end_date) filters.end_date = end_date;
    
    // Get filtered trading requests
    const requests = await TradingRequest.getFilteredHistory(filters);
    
    // Create CSV content
    let csvContent = 'Request ID,Date Created,Employee Email,Stock Name,Ticker,Trading Type,Shares,Estimated Value,Status,Escalated,Escalation Reason,Processed Date\n';
    
    requests.forEach(request => {
      const createdDate = formatExcelDateTime(new Date(request.created_at));
      const processedDate = request.processed_at ? 
        formatExcelDateTime(new Date(request.processed_at)) : 'Not Processed';
      const escalated = request.escalated ? 'Yes' : 'No';
      const escalationReason = (request.escalation_reason || '').replace(/"/g, '""').replace(/\n/g, ' '); // Escape quotes and newlines for CSV
      const stockName = (request.stock_name || '').replace(/"/g, '""');
      const estimatedValue = parseFloat(request.total_value_usd || request.total_value || 0).toFixed(2);
      
      csvContent += `"${request.id}","${createdDate}","${request.employee_email}","${stockName}","${request.ticker}","${request.trading_type.toUpperCase()}","${request.shares}","$${estimatedValue}","${request.status.toUpperCase()}","${escalated}","${escalationReason}","${processedDate}"\n`;
    });
    
    // Set headers for file download
    const timestamp = new Date().toISOString().split('T')[0];
    const filterSuffix = employee_email ? `-${employee_email.split('@')[0]}` : '';
    const dateSuffix = start_date && end_date ? `-${start_date}-to-${end_date}` : start_date ? `-from-${start_date}` : end_date ? `-until-${end_date}` : '';
    
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="trading-requests-export${filterSuffix}${dateSuffix}-${timestamp}.csv"`);
    
    res.send(csvContent);
    
  } catch (error) {
    console.error('Error exporting trading requests:', error);
    res.status(500).send('Error exporting trading requests');
  }
});

// Admin backup database route
app.get('/admin-backup-database', requireAdmin, async (req, res) => {
  
  try {
    const { exec } = require('child_process');
    const util = require('util');
    const execPromise = util.promisify(exec);
    
    // Get current timestamp for filename
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, -5);
    const filename = `trading-backup-${timestamp}.sql`;
    
    // Create the pg_dump command with proper formatting
    const pgDumpCommand = `pg_dump "${process.env.DATABASE_URL}" --no-owner --no-privileges --clean --if-exists`;
    
    console.log(`Executing database backup for admin: ${req.session.admin?.username || 'admin'}`);
    
    try {
      const { stdout, stderr } = await execPromise(pgDumpCommand);
      
      if (stderr && !stderr.includes('warning')) {
        console.error('pg_dump stderr:', stderr);
        throw new Error(stderr);
      }
      
      // Set headers for SQL file download
      res.setHeader('Content-Type', 'application/sql');
      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
      res.setHeader('Content-Length', Buffer.byteLength(stdout));
      
      // Log backup activity
      const AuditLog = require('./models/AuditLog');
      await AuditLog.logActivity(
        req.session.admin?.username || 'admin@company.com',
        'admin',
        'backup_database',
        'system',
        null,
        JSON.stringify({
          filename: filename,
          size_bytes: Buffer.byteLength(stdout),
          timestamp: new Date().toISOString()
        }),
        req.ip,
        req.get('User-Agent'),
        req.sessionID
      );
      
      // Send the SQL dump
      res.send(stdout);
      
    } catch (cmdError) {
      console.error('pg_dump execution error:', cmdError);
      
      // Fallback: Try using direct PostgreSQL connection for export
      const database = require('./models/database');
      const pool = database.getPool();
      
      // Generate SQL export manually
      let sqlDump = `-- Trading Compliance Database Backup
-- Generated: ${new Date().toISOString()}
-- Database: PostgreSQL
-- Warning: This is a simplified backup. For full backup, ensure pg_dump is available.

`;
      
      // Get all table data
      const tables = [
        'restricted_stocks',
        'trading_requests', 
        'audit_logs',
        'restricted_stock_changelog'
      ];
      
      for (const table of tables) {
        sqlDump += `\n-- Table: ${table}\n`;
        sqlDump += `DELETE FROM ${table};\n`;
        
        const result = await pool.query(`SELECT * FROM ${table}`);
        
        if (result.rows.length > 0) {
          const columns = Object.keys(result.rows[0]);
          
          for (const row of result.rows) {
            const values = columns.map(col => {
              const val = row[col];
              if (val === null) return 'NULL';
              if (typeof val === 'string') return `'${val.replace(/'/g, "''")}'`;
              if (val instanceof Date) return `'${val.toISOString()}'`;
              return val;
            });
            
            sqlDump += `INSERT INTO ${table} (${columns.join(', ')}) VALUES (${values.join(', ')});\n`;
          }
        }
      }
      
      // Set headers and send
      res.setHeader('Content-Type', 'application/sql');
      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
      res.send(sqlDump);
    }
    
  } catch (error) {
    console.error('Error creating database backup:', error);
    res.status(500).send(`
      <!DOCTYPE html>
      <html lang="en">
      <head>
          <meta charset="UTF-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <title>Backup Error</title>
          <link rel="stylesheet" href="/styles-modern.css">
      </head>
      <body>
          <div class="container">
              <div class="card" style="margin-top: 50px; max-width: 600px; margin-left: auto; margin-right: auto;">
                  <div class="card-header">
                      <h3 class="card-title">❌ Backup Failed</h3>
                  </div>
                  <div class="card-body">
                      <p>Unable to create database backup. This might be because pg_dump is not available in the Railway environment.</p>
                      <p>Error: ${error.message}</p>
                      <div style="margin-top: 20px;">
                          <a href="/admin-dashboard" class="btn btn-primary">Back to Dashboard</a>
                      </div>
                  </div>
              </div>
          </div>
      </body>
      </html>
    `);
  }
});


// Handle unhandled routes
app.all('*', handleNotFound);

// Global error handling middleware
app.use(globalErrorHandler);

const PORT = process.env.PORT || 3001;
const HOST = process.env.NODE_ENV === 'production' ? '0.0.0.0' : 'localhost';

app.listen(PORT, HOST, () => {
  console.log(`Server running on ${HOST}:${PORT}`);
  if (process.env.NODE_ENV !== 'production') {
    console.log(`Access the application at http://localhost:${PORT}`);
  }
});

module.exports = app;