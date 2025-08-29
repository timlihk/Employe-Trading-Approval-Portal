# Employee Trading Approval Portal

A comprehensive enterprise-grade employee pre-trading approval system with Microsoft 365 integration, built for compliance and audit requirements. Features modern UI design, bond trading support, and complete audit trails for regulatory compliance.

## 🌟 Key Features

### 🚀 **Core Trading Functionality**
- **Employee Portal**: Intuitive trading request submission with real-time validation
- **Bond & Equity Support**: Complete ISIN validation for bonds and ticker validation for equities  
- **Two-Step Workflow**: Preview → Compliance Declaration → Submit → Result confirmation
- **Automatic Processing**: Real-time approval/rejection based on restricted instruments list
- **Currency Conversion**: Automatic USD conversion for foreign stocks with real-time exchange rates
- **Escalation System**: Business justification workflow for declined trades with admin priority review

### 🔐 **Authentication & Security**
- **Microsoft 365 SSO**: Seamless single sign-on integration (optional)
- **Conditional Authentication**: Automatically switches between SSO and demo mode
- **Enterprise Security**: Rate limiting, CSRF protection, secure sessions, helmet security headers
- **Audit Trail**: Complete activity logging with IP addresses, session IDs, and user actions
- **Input Validation**: Comprehensive sanitization and validation for all user inputs

### 📊 **Advanced Management & Reporting**
- **Dynamic Sorting**: All tables support clickable column headers with visual sort indicators
- **Restricted Instruments Management**: Add/remove stocks and bonds with complete changelog
- **Advanced Filtering**: Date ranges, ticker search, trading type, status, and instrument type filters
- **CSV Export**: Full data export for trading requests, audit logs, and personal history
- **Database Backup**: Complete database export with metadata and statistics
- **Admin Dashboard**: Centralized management with quick actions and escalated request review

### 🎨 **Modern User Interface**
- **Clean Design**: Simplified forms without asterisks and unnecessary text
- **Responsive Layout**: Works seamlessly on desktop and mobile devices
- **Accessibility**: Pure HTML forms compatible with all browsers and assistive technologies
- **Visual Indicators**: Status badges, sort arrows, and clear action buttons
- **Professional Styling**: Goldman Sachs-inspired design system

## 🏗️ Architecture Overview

### **Layered Architecture**
```
┌─────────────────┐
│   Controllers   │ ← HTTP request handling
├─────────────────┤
│    Services     │ ← Business logic layer  
├─────────────────┤
│     Models      │ ← Data access layer
├─────────────────┤
│   Middleware    │ ← Security & validation
└─────────────────┘
```

### **Technology Stack**
- **Backend**: Node.js with Express.js framework
- **Database**: PostgreSQL with timezone-aware queries
- **Authentication**: Microsoft 365 OAuth 2.0 + admin credentials
- **Frontend**: Server-side rendering with pure HTML forms
- **Security**: Helmet, CSP, rate limiting, audit logging
- **Deployment**: Railway-optimized with auto-scaling

### **Security Features**
- **Content Security Policy**: Blocks all JavaScript execution for maximum security
- **Rate Limiting**: Configurable limits for authentication and admin actions
- **Session Security**: Secure cookie configuration with HTTPOnly flags
- **Input Protection**: SQL injection and XSS prevention
- **Audit Logging**: Complete activity tracking for compliance

## 🚀 Quick Deployment

### **Deploy to Railway**

[![Deploy on Railway](https://railway.app/button.svg)](https://railway.app/template/your-template)

1. **Connect Repository**: Link your GitHub repository to Railway
2. **Auto-Deploy**: Railway detects Node.js and deploys automatically
3. **Configure Environment**: Set required environment variables (see below)
4. **Access Application**: Use provided Railway URL

### **Required Environment Variables**

```bash
# Core Application (Required)
NODE_ENV=production
SESSION_SECRET=your-secure-random-32-character-key-here
ADMIN_USERNAME=admin
ADMIN_PASSWORD=your-secure-admin-password
DATABASE_URL=postgresql://[auto-provided-by-railway]

# Application Settings
PORT=3000
LOG_LEVEL=info
FRONTEND_URL=https://your-app.railway.app
```

### **Microsoft 365 Integration (Optional)**

To enable Microsoft 365 single sign-on:

```bash
# Azure AD App Registration
AZURE_CLIENT_ID=your-client-id
AZURE_CLIENT_SECRET=your-client-secret  
AZURE_TENANT_ID=your-tenant-id
REDIRECT_URI=https://your-app.railway.app/api/auth/microsoft/callback
POST_LOGOUT_REDIRECT_URI=https://your-app.railway.app
```

**Microsoft 365 Setup Steps:**
1. Go to Azure Active Directory > App registrations
2. Create new registration with redirect URI: `https://your-app.railway.app/api/auth/microsoft/callback`
3. Generate client secret in Certificates & secrets
4. Add environment variables to Railway
5. Application automatically detects and enables SSO

## 📈 New Features & Recent Updates

### **🆕 Latest Enhancements (2024)**

#### **Bond Trading Support**
- **ISIN Validation**: 12-character international bond identifier support
- **Automatic Detection**: System recognizes ISINs vs. stock tickers
- **Bond Information**: Company name resolution for bond issuers
- **Instrument Type Tracking**: Separate handling for bonds vs. equities

#### **Enhanced Table Sorting**
- **Clickable Headers**: Click any column header to sort
- **Visual Indicators**: Shows current sort direction with ↑/↓ arrows
- **Multiple Tables**: Sorting available on all data tables
- **State Persistence**: Sort preferences maintained across navigation

#### **Improved User Experience**
- **Clean Forms**: Removed asterisks and unnecessary tip text
- **Better Spacing**: Improved button layouts and form spacing
- **Simplified Interface**: Streamlined forms for faster completion
- **Error Handling**: Better error messages for duplicate entries

#### **Advanced Database Management**
- **Complete Backups**: Full database export with metadata and statistics
- **Session Tracking**: Active session data included in backups
- **Audit Logging**: Enhanced logging for all backup operations
- **Recovery Support**: Comprehensive data for disaster recovery

### **🔧 Technical Improvements**

#### **Microsoft 365 Integration**
- **Conditional UI**: Shows SSO login when configured, demo mode otherwise
- **OAuth Flow**: Complete authentication with login, callback, and logout
- **Session Management**: Proper user session handling and cleanup
- **Error Handling**: Graceful handling of SSO errors and state mismatches

#### **Security Enhancements**
- **CSRF Protection**: Token-based protection for all forms
- **Rate Limiting**: Increased limits for Railway deployment (1000 req/15min)
- **Input Sanitization**: Enhanced validation for bond ISINs and tickers
- **Audit Trail**: Complete logging of admin and user activities

#### **Database Optimizations**
- **Instrument Type Support**: Proper handling of bonds vs. equities
- **Index Creation**: Performance indexes for common queries
- **Data Integrity**: Constraints and validation at database level
- **Timezone Handling**: Hong Kong timezone support (UTC+8)

## 📊 API Endpoints & Features

### **Authentication Endpoints**
- `GET /` - Landing page with conditional Microsoft 365 login
- `GET /api/auth/microsoft/login` - Start Microsoft 365 OAuth flow
- `GET /api/auth/microsoft/callback` - Handle OAuth callback
- `GET /api/auth/microsoft/logout` - Sign out and session cleanup
- `POST /admin-authenticate` - Admin credential authentication
- `GET /employee-dummy-login` - Demo login (when SSO not configured)

### **Admin Management**
- `GET /admin-dashboard` - Dashboard with quick actions
- `GET /admin-requests` - Trading requests with sorting and filtering
- `GET /admin-restricted-stocks` - Instrument management with sorting
- `GET /admin-audit-log` - Complete audit trail with export
- `GET /admin-backup-database` - Complete database backup download
- `POST /admin-add-stock` - Add restricted instrument (stock or bond)
- `POST /admin-remove-stock` - Remove from restricted list

### **Employee Portal**
- `GET /employee-dashboard` - Clean trading request form
- `GET /employee-history` - Personal history with sorting and filtering
- `GET /employee-export-history` - Personal CSV export
- `GET /escalate-form/:id` - Request escalation with business justification

### **Trading Workflow**
- `POST /preview-trade` - Preview with compliance declaration
- `POST /submit-trade` - Final submission after confirmation
- `GET /trade-result/:id` - Approval/rejection result page
- `POST /submit-escalation` - Escalate declined request

## 🔍 Advanced Features

### **Dynamic Sorting System**
```javascript
// All tables support sorting by:
- Ticker/ISIN (alphabetical)
- Company Name (alphabetical)  
- Date Added/Created (chronological)
- Request ID (numerical)
- Total Value (monetary)

// Visual indicators show current sort:
↑ Ascending order
↓ Descending order
```

### **Comprehensive Filtering**
```javascript
// Available filters:
- Date ranges (start/end dates)
- Ticker/ISIN search
- Trading type (buy/sell)
- Status (pending/approved/rejected)
- Instrument type (equity/bond)
- Employee email (admin only)
- Escalation status
```

### **Export Capabilities**
- **CSV Format**: All exports in standard CSV with proper escaping
- **Timestamped Files**: Automatic filename generation with timestamps
- **Filter Preservation**: Exports respect applied filters and sorting
- **Complete Data**: All relevant fields included
- **Hong Kong Timezone**: All dates in HK timezone (UTC+8)

### **Security Features**
- **Input Validation**: Comprehensive validation for all user inputs
- **SQL Injection Prevention**: Parameterized queries throughout
- **XSS Protection**: HTML escaping and Content Security Policy
- **Session Security**: Secure session configuration with rotation
- **Rate Limiting**: Configurable limits for different endpoints
- **Audit Logging**: Complete activity tracking for compliance

## 🛠️ Development Setup

### **Local Development**

```bash
# Clone repository
git clone https://github.com/timlihk/Employe-Trading-Approval-Portal.git
cd trading_approval

# Install dependencies
npm install

# Configure environment (.env file)
NODE_ENV=development
SESSION_SECRET=dev_secret_change_in_production
ADMIN_USERNAME=admin
ADMIN_PASSWORD=password123
DATABASE_URL=postgresql://localhost:5432/trading_approval

# Optional: Microsoft 365 integration
AZURE_CLIENT_ID=your_client_id
AZURE_CLIENT_SECRET=your_client_secret
AZURE_TENANT_ID=your_tenant_id

# Start development server
npm start
```

### **Database Setup**
```bash
# PostgreSQL required (local or hosted)
# Application automatically creates tables on startup
# No manual database setup needed
```

### **Testing**
```bash
# Run application locally
npm start

# Test endpoints
curl http://localhost:3000/health

# Access admin interface
# Default: admin/password123
```

## 📱 User Guide

### **For Employees**
1. **Login**: Use Microsoft 365 or demo login
2. **Submit Request**: Fill out clean, simple form
3. **Preview**: Review details and declare compliance
4. **Track Status**: Monitor approval/rejection in history
5. **Escalate**: Provide business justification if needed

### **For Administrators**
1. **Manage Requests**: Review, approve, or reject submissions
2. **Restricted Instruments**: Add/remove stocks and bonds with sorting
3. **Audit Trail**: View complete activity logs
4. **Data Export**: Download CSV reports and database backups
5. **Escalated Requests**: Review business justifications for priority handling

## 🔧 Configuration Options

### **Authentication Modes**
```javascript
// Microsoft 365 SSO (when configured)
- Automatic detection based on environment variables
- Seamless login with company credentials
- Proper logout with session cleanup

// Demo Mode (fallback)
- Simple email-based authentication
- Suitable for testing and development
- Clearly labeled as demo mode
```

### **Rate Limiting**
```javascript
// Configurable limits in middleware/security.js
- General: 1000 requests per 15 minutes
- Authentication: 5 attempts per 15 minutes  
- Admin actions: 10 actions per minute
```

### **Database Configuration**
```javascript
// PostgreSQL settings
- Auto-table creation on startup
- Timezone-aware queries (Hong Kong UTC+8)
- Performance indexes for common queries
- Complete audit trail storage
```

## 🚨 Security Best Practices

### **Deployment Security**
- ✅ Use strong SESSION_SECRET (32+ characters)
- ✅ Set secure ADMIN_USERNAME and ADMIN_PASSWORD
- ✅ Enable HTTPS (automatic on Railway)
- ✅ Configure Microsoft 365 with proper redirect URIs
- ✅ Regularly backup database using built-in tools
- ✅ Monitor audit logs for suspicious activity

### **Access Control**
- ✅ Role-based access (employee vs admin)
- ✅ Session-based authentication with automatic expiration
- ✅ CSRF protection on all forms
- ✅ Input validation and sanitization
- ✅ SQL injection prevention with parameterized queries

## 📋 Compliance Features

### **Audit Requirements**
- **Complete Logging**: All user actions logged with timestamps
- **IP Tracking**: User IP addresses recorded for all activities
- **Session Correlation**: Request correlation IDs for debugging
- **Data Export**: CSV exports for regulatory reporting
- **Backup System**: Complete database backups for disaster recovery

### **Data Retention**
- **Permanent Storage**: All trading requests and audit logs retained
- **Changelog Tracking**: Complete history of restricted stock changes
- **Escalation Records**: Business justifications and admin decisions
- **Database Backups**: Regular backups with metadata and statistics

## 📞 Support & Contributing

### **Getting Help**
- **Documentation**: Comprehensive README and inline comments
- **Railway Logs**: Check deployment logs for issues
- **Health Checks**: Use `/health` endpoint for monitoring
- **Audit Logs**: Review `/admin-audit-log` for debugging

### **Contributing**
- **Architecture**: Follow established patterns in controllers/services/models
- **Security**: Maintain audit logging and input validation
- **Testing**: Test locally before deployment
- **Documentation**: Update README for significant changes

### **Reporting Issues**
1. Check Railway deployment logs
2. Review application audit logs
3. Verify environment variable configuration
4. Test with minimal reproduction case
5. Include relevant log entries in bug reports

---

## 📄 License & Credits

This Employee Trading Approval Portal is built with enterprise-grade security and compliance in mind. The application follows industry best practices for financial technology applications and provides complete audit trails for regulatory compliance.

**Built with**: Node.js, Express.js, PostgreSQL, Microsoft 365 integration, and Railway deployment optimization.

---

*Last Updated: August 29, 2025 - Version 2.2 with Improved UI and Error Handling*