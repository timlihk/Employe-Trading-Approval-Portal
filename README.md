# Trading Compliance Portal

A comprehensive employee pre-trading approval system with Microsoft 365 integration, built for compliance and audit requirements.

## Features

- **Employee Portal**: Trading request submission with real-time approval/rejection
- **Admin Dashboard**: Complete trading request management and oversight
- **Restricted Stock Management**: Dynamic restricted stock list with audit trail
- **Escalation Workflow**: Business justification for declined trades
- **Comprehensive Reporting**: CSV export functionality with filtering
- **Audit Logging**: Complete activity tracking for compliance
- **Microsoft 365 Integration**: Single sign-on authentication
- **Goldman Sachs Design System**: Professional, modern interface

## Technology Stack

- **Backend**: Node.js with Express
- **Database**: SQLite with comprehensive audit logging
- **Authentication**: Microsoft 365 OAuth integration
- **Frontend**: Server-side rendered HTML with modern CSS
- **Deployment**: Railway-ready with health checks

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
In Railway dashboard, add these environment variables:

```bash
NODE_ENV=production
SESSION_SECRET=your-secure-random-key-here
ADMIN_USERNAME=admin
ADMIN_PASSWORD=your-secure-admin-password
PORT=3000
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
- Login with admin credentials (default: admin/admin123 - **CHANGE THESE**)
- Start managing trading requests and restricted stocks

## Default Credentials

� **IMPORTANT**: Change these immediately after deployment:
- **Admin Username**: `admin`
- **Admin Password**: `admin123`

## Database

The application uses SQLite and automatically initializes with:
- Empty restricted stocks list (add via admin panel)
- Audit logging tables
- Compliance settings
- All necessary schema

## Health Check

The application includes a health check endpoint at `/health` for Railway monitoring.

## Security Features

- Session-based authentication
- CSRF protection
- Input validation
- SQL injection prevention
- Comprehensive audit logging
- Secure password handling

## Support

For issues or questions, please check the application logs in Railway dashboard.