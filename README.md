# Trading Compliance Portal

A comprehensive employee pre-trading approval system with Microsoft 365 integration, built for compliance and audit requirements. Features enterprise-grade architecture with proper separation of concerns, comprehensive security, and scalable design patterns.

## Features

- **Employee Portal**: Trading request submission with real-time ticker validation and approval tracking
- **Admin Dashboard**: Complete trading request management with advanced filtering and bulk operations
- **Dynamic Sorting**: All reporting tables support sorting by Request ID, Date, or Ticker in ascending/descending order
- **Advanced Filtering**: Comprehensive filtering with date ranges, ticker search, and trading type selection
- **Restricted Stock Management**: Dynamic restricted stock list with full audit trail and changelog
- **Escalation Workflow**: Business justification system for declined trades with admin priority review
- **CSV Export**: Full data export functionality with current sorting and filtering applied
- **Advanced Security**: Rate limiting, input validation, comprehensive audit logging, and secure session management
- **Real-time Validation**: Yahoo Finance API integration for ticker validation and pricing
- **Database Backup**: Built-in database export functionality for disaster recovery
- **Microsoft 365 Integration**: Optional single sign-on authentication
- **Professional UI**: Goldman Sachs-inspired design system with responsive layout

## Architecture Overview

The application follows enterprise-grade architectural patterns:

### 🏗️ **Layered Architecture**
- **Controllers**: Handle HTTP requests/responses (`AdminController`, `EmployeeController`, `TradingRequestController`)
- **Services**: Business logic layer (`AdminService`, `TradingRequestService`)
- **Models**: Data access layer with BaseModel pattern (`TradingRequest`, `RestrictedStock`, `AuditLog`)
- **Middleware**: Security, validation, error handling, and logging

### 🔒 **Security Features**
- **Input Validation**: Comprehensive validation middleware with sanitization
- **Rate Limiting**: Configurable rate limits for authentication and admin actions
- **Error Handling**: Centralized error handling with development/production modes
- **Audit Logging**: Complete activity tracking with request correlation IDs
- **Session Security**: Secure session configuration with proper CSRF protection

### 📊 **Monitoring & Logging**
- **Winston Logging**: Structured logging with request correlation
- **Health Checks**: Built-in health monitoring for Railway deployment
- **Security Events**: Dedicated security event logging for compliance

## Technology Stack

- **Backend**: Node.js with Express.js framework
- **Database**: PostgreSQL (Railway) / SQLite (local development)
- **Authentication**: Microsoft 365 OAuth 2.0 integration + email-based fallback
- **Architecture**: MVC pattern with service layer and middleware
- **Security**: Helmet, rate limiting, input validation, audit logging
- **Deployment**: Railway-optimized with health checks and environment detection

## Deployment Instructions

### Prerequisites
- Railway account
- Microsoft 365 app registration (optional)
- Basic knowledge of environment variables

### Step 1: Deploy to Railway
1. Connect your GitHub repository to Railway
2. Railway will automatically detect the Node.js application
3. The app will deploy using the provided `railway.json` and `nixpacks.toml`

### Step 2: Configure Environment Variables
In Railway dashboard, add these **required** environment variables:

```bash
# Core Application (Required)
NODE_ENV=production
SESSION_SECRET=your-secure-random-32-character-key-here
ADMIN_USERNAME=admin
ADMIN_PASSWORD=your-secure-admin-password
DATABASE_URL=postgresql://[auto-provided-by-railway]

# Optional Application Settings
PORT=3000
LOG_LEVEL=info
FRONTEND_URL=https://your-app.railway.app
```

### Step 3: Optional Microsoft 365 Setup
If you want SSO integration:
```bash
AZURE_CLIENT_ID=your-client-id
AZURE_CLIENT_SECRET=your-client-secret
AZURE_TENANT_ID=your-tenant-id
REDIRECT_URI=https://your-app.railway.app/api/auth/microsoft/callback
POST_LOGOUT_REDIRECT_URI=https://your-app.railway.app
```

### Step 4: Access the Application
- Navigate to your Railway-provided URL
- Login with admin credentials (set via environment variables)
- Start managing trading requests and restricted stocks

## Security Configuration

⚠️ **CRITICAL SECURITY**: Configure these environment variables before deployment:
- **SESSION_SECRET**: Generate a secure 32+ character random string
- **ADMIN_USERNAME**: Set a secure admin username 
- **ADMIN_PASSWORD**: Set a strong admin password

## Database

The application supports both PostgreSQL (production) and SQLite (development):
- **Railway Deployment**: Automatically uses PostgreSQL with `DATABASE_URL`
- **Local Development**: Falls back to SQLite if no `DATABASE_URL` provided
- **Auto-initialization**: Creates all necessary tables on first run
- **Audit Trail**: Complete activity logging for compliance requirements

## API Endpoints

### Health & Monitoring
- `GET /health` - Application health check for Railway monitoring
- `GET /db-status` - Database status and connection info (admin only)

### Authentication
- `GET /` - Landing page with login options
- `POST /employee-authenticate` - Employee email authentication
- `POST /admin-authenticate` - Admin credential authentication
- `GET /api/auth/microsoft/*` - Microsoft 365 OAuth flow (if enabled)

### Admin Management
- `GET /admin-dashboard` - Admin dashboard with statistics
- `GET /admin-requests` - Trading requests management with sorting
- `GET /admin-restricted-stocks` - Restricted stocks management
- `GET /admin-export-trading-requests` - CSV export of all trading requests
- `GET /admin-backup-database` - Full database backup

### Employee Portal
- `GET /employee-dashboard` - Employee trading request submission
- `GET /employee-history` - Personal trading history with sorting and filtering
- `GET /employee-export-history` - Personal CSV export with applied filters
- `GET /escalate-form/:id` - Request escalation form

## Reporting & Data Management

### 📊 **Dynamic Sorting**
All reporting tables support flexible sorting options:

**Sort Fields:**
- **Request ID** - Sort by unique request identifier (most recent first)
- **Date** - Sort by creation timestamp (chronological order)  
- **Ticker** - Sort alphabetically by stock symbol
- **Employee** - Sort by employee email (admin tables only)

**Sort Directions:**
- **↓ Descending** - Newest/highest first (default)
- **↑ Ascending** - Oldest/lowest first

**Usage:**
```
URL: /admin-requests?sort_by=created_at&sort_order=ASC
URL: /employee-history?sort_by=ticker&sort_order=DESC&ticker=AAPL
```

### 🔍 **Advanced Filtering**
Employee history supports comprehensive filtering:
- **Date Range** - Filter by start and end dates
- **Ticker Search** - Find specific stock symbols
- **Trading Type** - Filter by buy/sell transactions
- **Combined Filters** - Multiple filters work together

### 📥 **CSV Export Features**
- **Maintains Sorting** - Exports respect current sort order
- **Preserves Filters** - Employee exports include applied filters
- **Timestamped Files** - Automatic filename generation with timestamps
- **Complete Data** - All relevant fields included in exports

### 📋 **Real-time Table Updates**
- **Instant Sorting** - Tables update immediately when changing sort options
- **Visual Indicators** - Headers show current sort field and direction
- **Preserved State** - Sorting maintained across page navigation
- **Filter Integration** - Sorting works seamlessly with filtering

## Development Setup

```bash
# Clone repository
git clone <your-repo>
cd trading_approval

# Install dependencies
npm install

# Set up environment variables (create .env file)
NODE_ENV=development
SESSION_SECRET=dev_secret_key_change_in_production
ADMIN_USERNAME=admin
ADMIN_PASSWORD=password123

# Optional: Microsoft 365 integration
AZURE_CLIENT_ID=your_client_id
AZURE_CLIENT_SECRET=your_client_secret
AZURE_TENANT_ID=your_tenant_id

# Start development server
npm start
```

## Security Features

### 🔒 **Authentication & Authorization**
- Secure session-based authentication with configurable expiration
- Role-based access control (employee vs admin)
- Optional Microsoft 365 OAuth 2.0 integration
- Automatic session invalidation and cleanup

### 🛡️ **Input Protection**
- Comprehensive input validation with express-validator
- SQL injection prevention with parameterized queries
- XSS protection with proper HTML escaping
- Rate limiting to prevent brute force attacks

### 📋 **Audit & Compliance**
- Complete audit logging of all user actions
- Security event logging with correlation IDs
- Request/response logging with IP tracking
- Structured logging with Winston for analysis

### 🌐 **Network Security**
- Helmet.js security headers
- CSRF protection for all state-changing operations
- Secure cookie configuration with HTTPOnly flags
- Content Security Policy (CSP) implementation

## Monitoring & Troubleshooting

### Log Files
- `logs/combined.log` - All application logs
- `logs/error.log` - Error-level logs only
- Console output includes request correlation IDs

### Health Monitoring
- Railway automatically monitors `/health` endpoint
- Database connectivity checks
- Application uptime tracking

## Architecture Benefits

✅ **Maintainability**: Clear separation of concerns with layered architecture  
✅ **Scalability**: Service layer enables easy feature additions  
✅ **Security**: Multiple layers of protection and comprehensive audit trails  
✅ **Testability**: Isolated business logic in services for unit testing  
✅ **Debugging**: Structured logging with correlation IDs  
✅ **Performance**: Optimized database queries and caching-ready architecture  

## Support & Contributing

- **Issues**: Check Railway logs and application logs for debugging
- **Architecture**: Follow established patterns in controllers/services/models
- **Security**: All changes must maintain audit logging and input validation
- **Testing**: Test locally before deployment, verify all routes work properly