# Trading Compliance Portal

A comprehensive employee pre-trading approval system with Microsoft 365 integration, built for compliance and audit requirements. Features enterprise-grade architecture with proper separation of concerns, comprehensive security, and scalable design patterns.

## Features

### 🚀 **Core Functionality**
- **Employee Portal**: Trading request submission with real-time ticker validation and approval tracking
- **Admin Dashboard**: Complete trading request management with advanced filtering and bulk operations
- **Two-Step Trading Workflow**: Preview → Compliance Declaration → Submit → Result confirmation
- **Automatic Processing**: Real-time approval/rejection based on restricted stock list with escalation workflow
- **Currency Conversion**: Automatic USD conversion for foreign stocks with real-time exchange rates
- **Pure HTML Forms**: No JavaScript dependency - works with all browsers and security policies

### 📊 **Advanced Reporting & Analytics**
- **Dynamic Sorting**: All tables support sorting by Request ID, Date, Ticker, Employee, and Value
- **Advanced Filtering**: Comprehensive filtering with date ranges, ticker search, trading type, and status
- **Status Management**: Pending, Approved, Rejected status tracking with escalation capabilities
- **CSV Export**: Full data export functionality for trading requests and audit logs
- **Timezone Support**: Hong Kong timezone (UTC+8) for accurate date filtering and display

### 🛡️ **Security & Compliance**
- **Restricted Stock Management**: Dynamic restricted stock list with full audit trail and changelog
- **Escalation Workflow**: Business justification system for declined trades with admin priority review
- **Comprehensive Audit Logging**: Complete activity tracking with IP addresses, session IDs, and user actions
- **Database Management**: Backup and reset functionality with confirmation workflows
- **Advanced Security**: Rate limiting, input validation, Content Security Policy, and secure session management

### 🔗 **Integration & Authentication**
- **Microsoft 365 SSO**: Optional single sign-on authentication (can be disabled)
- **Real-time Validation**: External API integration for ticker validation and currency conversion
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
- **Database**: PostgreSQL (Railway production) with timezone-aware queries
- **Authentication**: Microsoft 365 OAuth 2.0 (optional) with admin credential fallback
- **Frontend**: Pure HTML forms with server-side rendering (no JavaScript)
- **Architecture**: MVC pattern with service layer and comprehensive middleware
- **Security**: Helmet, Content Security Policy, rate limiting, input validation, comprehensive audit logging
- **External APIs**: Currency conversion and ticker validation services
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
- `GET /` - Landing page with Microsoft 365 SSO login
- `POST /admin-authenticate` - Admin credential authentication
- `GET /api/auth/microsoft/*` - Microsoft 365 OAuth flow (if enabled)
- `GET /admin-login` - Admin login form

### Admin Management
- `GET /admin-dashboard` - Admin dashboard with action buttons and escalated requests review
- `GET /admin-requests` - Trading requests management with advanced filtering and sorting
- `GET /admin-restricted-stocks` - Restricted stocks management with changelog
- `GET /admin-audit-log` - Complete audit log with export functionality
- `GET /admin-export-trading-requests` - CSV export of all trading requests
- `GET /admin-export-audit-log` - CSV export of complete audit log
- `GET /admin-backup-database` - Full database backup as JSON
- `GET /admin-clear-database-confirm` - Database reset confirmation with warnings
- `POST /admin-clear-database` - Complete database reset functionality

### Employee Portal
- `GET /employee-dashboard` - Employee trading request submission form
- `GET /employee-history` - Personal trading history with advanced filtering and sorting
- `GET /employee-export-history` - Personal CSV export with applied filters
- `GET /escalate-form/:id` - Request escalation form with business justification

### Trading Request Workflow
- `POST /preview-trade` - Preview trading request with compliance declaration
- `POST /submit-trade` - Submit trading request after compliance confirmation
- `GET /trade-result/:requestId` - Display approval/rejection result
- `POST /submit-escalation` - Submit escalation with business justification

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
- **Trading Requests Export** - Complete trading request data with USD values and status
- **Audit Log Export** - Full audit trail with timestamps, IP addresses, and session IDs  
- **Maintains Sorting** - Exports respect current sort order
- **Preserves Filters** - Employee exports include applied filters
- **Timestamped Files** - Automatic filename generation with timestamps
- **Complete Data** - All relevant fields included in exports
- **Hong Kong Timezone** - All dates and times displayed in HK timezone (UTC+8)

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

# Optional: Microsoft 365 integration (can be disabled)
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
- Microsoft 365 OAuth 2.0 integration (optional - can be disabled)
- Admin credential fallback for environments without SSO
- Automatic session invalidation and cleanup
- Email-based employee authentication removed for security

### 🛡️ **Input Protection**
- Pure HTML forms with no JavaScript dependencies
- Comprehensive input validation with express-validator
- SQL injection prevention with parameterized queries
- XSS protection with proper HTML escaping and Content Security Policy
- Rate limiting to prevent brute force attacks
- Ticker input sanitization and case normalization

### 📋 **Audit & Compliance**
- Complete audit logging of all user actions with timestamps and IP addresses
- Security event logging with correlation IDs and session tracking
- Request/response logging with IP tracking and user agent information
- Structured logging with Winston for analysis and export capabilities
- Database backup and restore functionality with admin confirmation
- Comprehensive activity tracking for compliance requirements

### 🌐 **Network Security**
- Helmet.js security headers with strict CSP
- Content Security Policy configured for no JavaScript execution
- Secure cookie configuration with HTTPOnly flags
- Rate limiting for authentication and admin actions
- Proper HTTPS handling for Railway deployment

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
✅ **Accessibility**: Pure HTML forms work with all browsers and assistive technologies  
✅ **Compliance**: Complete audit trails and data export for regulatory requirements  

## Recent Updates & Improvements

### 🚀 **Version 2.0 Features**
- **No JavaScript Architecture**: Complete removal of client-side JavaScript for maximum security and compatibility
- **Enhanced Compliance Workflow**: Two-step trading process with mandatory compliance declaration
- **Currency Conversion**: Automatic USD conversion for foreign stocks with real-time exchange rates
- **Advanced Admin Tools**: Database reset with confirmation, audit log export, escalated request management
- **Timezone Support**: Hong Kong timezone (UTC+8) handling for accurate date filtering and display
- **Improved Security**: Content Security Policy blocking all scripts, comprehensive input validation

### 🔧 **Recent Technical Improvements**
- **Status Management**: Fixed status tracking to properly show approved/rejected requests
- **Database Optimization**: PostgreSQL timezone-aware queries for accurate date filtering  
- **Export Enhancements**: Added audit log CSV export with complete activity tracking
- **UI Simplification**: Removed complex JavaScript interactions in favor of server-side processing
- **Admin Dashboard**: Streamlined interface with direct action buttons and escalated request review
- **Error Handling**: Comprehensive error pages and user-friendly messages

## Support & Contributing

- **Issues**: Check Railway logs and application logs for debugging
- **Architecture**: Follow established patterns in controllers/services/models
- **Security**: All changes must maintain audit logging and input validation
- **Testing**: Test locally before deployment, verify all routes work properly