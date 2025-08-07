# Railway Deployment Guide - Enterprise Architecture

## Step-by-Step Railway Deployment Instructions

This guide covers deployment of the enterprise-grade Trading Compliance Portal with layered architecture, comprehensive security, and PostgreSQL database.

### Prerequisites
1. GitHub account with the repository
2. Railway account (sign up at railway.app)
3. Basic understanding of environment variables
4. Understanding of PostgreSQL (Railway provides this automatically)

### Step 1: Connect to Railway

1. **Visit Railway**: Go to [railway.app](https://railway.app)
2. **Sign in**: Use your GitHub account to sign in
3. **New Project**: Click "New Project"
4. **Deploy from GitHub**: Select "Deploy from GitHub repo"
5. **Select Repository**: Choose your trading approval repository
6. **Deploy**: Click "Deploy Now"

Railway will automatically:
- Detect it's a Node.js application
- Use the `nixpacks.toml` configuration
- Install dependencies with `npm ci --only=production`
- Start the app with `npm start`

### Step 2: Configure Environment Variables

In your Railway project dashboard:

1. **Go to Variables tab**
2. **Add the following variables**:

#### Required Variables:
```
# Core Application Settings
NODE_ENV=production
SESSION_SECRET=your-super-secure-random-key-at-least-32-chars
ADMIN_USERNAME=admin
ADMIN_PASSWORD=your-secure-admin-password-here
DATABASE_URL=postgresql://[auto-provided-by-railway]

# Optional Application Settings  
PORT=3000
LOG_LEVEL=info
FRONTEND_URL=https://your-app-name.up.railway.app
```

**⚠️ CRITICAL**: Railway automatically provides `DATABASE_URL` for PostgreSQL - do not set this manually.

#### Optional Microsoft 365 Integration:
```
AZURE_CLIENT_ID=your-azure-client-id
AZURE_CLIENT_SECRET=your-azure-client-secret
AZURE_TENANT_ID=your-azure-tenant-id
REDIRECT_URI=https://your-app-name.up.railway.app/api/auth/microsoft/callback
POST_LOGOUT_REDIRECT_URI=https://your-app-name.up.railway.app
```

#### Optional Email Configuration:
```
EMAIL_USER=your-email@company.com
EMAIL_PASS=your-app-password
EMAIL_FROM=compliance@company.com
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
```

### Step 3: Generate Secure Secrets

For `SESSION_SECRET`, generate a secure random string:
```bash
# Using Node.js
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"

# Or use online generator (use a trusted one)
# Or create your own: minimum 32 characters, mix of letters, numbers, symbols
```

### Step 4: Get Your App URL

1. **In Railway Dashboard**: Your app URL will be shown in the deployment section
2. **Format**: Usually `https://your-app-name.up.railway.app`
3. **Custom Domain**: You can add a custom domain in the Settings tab

### Step 5: Microsoft 365 Setup (Optional)

If you want Single Sign-On:

1. **Azure Portal**: Go to [portal.azure.com](https://portal.azure.com)
2. **App Registrations**: Create new registration
3. **Redirect URI**: Add your Railway URL + `/api/auth/microsoft/callback`
4. **Certificates & Secrets**: Create a client secret
5. **Copy Values**: Client ID, Client Secret, Tenant ID to Railway environment variables

### Step 6: First Access

1. **Visit Your App**: Go to your Railway URL
2. **Admin Login**: Use the credentials you set in environment variables
3. **Change Passwords**: Immediately change default admin password
4. **Add Restricted Stocks**: Use admin panel to add any restricted stocks
5. **Test Employee Flow**: Create a test trading request

### Step 7: Monitoring

Railway provides:
- **Logs**: View application logs in real-time
- **Metrics**: CPU, memory, network usage
- **Health Checks**: Automatic monitoring via `/health` endpoint
- **Deployments**: History of all deployments

### Step 8: Database Management

Railway provides managed PostgreSQL database:
- **PostgreSQL Instance**: Automatically provisioned and managed
- **Automatic Backups**: Railway handles database backups
- **Data Persistence**: All data persists between deployments
- **Auto-initialization**: Database schema created on first run
- **Built-in Backup**: App includes `/admin-backup-database` endpoint for manual exports
- **High Availability**: Railway ensures database uptime and performance

### Step 9: Application Architecture Features

This deployment includes enterprise-grade features:

#### 🏗️ **Layered Architecture**
- Controllers handle HTTP requests/responses
- Services contain business logic  
- Models manage database operations
- Middleware handles security, validation, logging

#### 🔒 **Security Features**
- Rate limiting to prevent brute force attacks
- Comprehensive input validation and sanitization
- Centralized error handling with proper logging
- Audit trail for all user actions
- Session security with configurable expiration

#### 📊 **Monitoring & Logging**
- Winston structured logging with request correlation IDs
- Health check endpoint at `/health` for Railway monitoring
- Database status endpoint at `/db-status` (admin only)
- Complete audit logging for compliance requirements

#### 🔍 **Advanced Reporting Features**
- **Dynamic Sorting**: All reporting tables support sorting by Request ID, Date, or Ticker
- **Real-time Updates**: Tables update instantly when changing sort options
- **CSV Exports**: Full data export with current sorting and filtering applied
- **Advanced Filtering**: Date ranges, ticker search, trading type selection
- **Visual Indicators**: Clear display of current sort field and direction
- **URL Parameters**: Sorting state preserved in URLs for bookmarking

## Security Checklist

Before going live:

- [ ] Set strong SESSION_SECRET (32+ characters, cryptographically secure)
- [ ] Configure secure ADMIN_USERNAME and ADMIN_PASSWORD
- [ ] Verify HTTPS is enabled (automatic on Railway)
- [ ] Test rate limiting on authentication endpoints
- [ ] Verify input validation is working on all forms
- [ ] Test Microsoft 365 integration if enabled
- [ ] Add restricted stocks as needed via admin panel
- [ ] Test complete employee workflow (request → approval/rejection)
- [ ] Verify audit logging is capturing all actions
- [ ] Test database backup functionality
- [ ] Test dynamic sorting functionality on admin and employee tables
- [ ] Verify CSV export includes correct sorting and filtering
- [ ] Review application logs for any security warnings

## Troubleshooting

### Common Issues:

1. **App won't start**: Check environment variables are set correctly
2. **Microsoft 365 login fails**: Verify redirect URIs match exactly
3. **Database issues**: Check logs for PostgreSQL/SQLite errors
4. **Health check fails**: Ensure `/health` endpoint responds
5. **Sorting not working**: Check that JavaScript is enabled and CSP allows inline scripts
6. **Tables not updating**: Verify network connection and check browser console for errors

### Checking Logs:

1. Go to Railway dashboard
2. Click on your project
3. Select "Deployments" tab
4. Click "View Logs" on latest deployment

### Getting Help:

- Check Railway documentation
- Review application logs
- Verify environment variable values
- Test health check endpoint: `https://your-app.railway.app/health`

## Production Checklist

- [ ] Application deployed successfully
- [ ] Health check endpoint responding
- [ ] Admin login working
- [ ] Environment variables configured
- [ ] Microsoft 365 integration tested (if enabled)
- [ ] Admin password changed from default
- [ ] Restricted stocks configured
- [ ] Employee workflow tested
- [ ] Admin approval/rejection workflow tested  
- [ ] Audit logging working
- [ ] CSV export functional
- [ ] Dynamic sorting working on all reporting tables
- [ ] Advanced filtering operational in employee history
- [ ] Table sorting indicators displaying correctly

## Support

If you encounter issues during deployment:

1. Check the Railway logs first
2. Verify all environment variables
3. Test the health endpoint
4. Review the application logs for specific errors

Your Trading Compliance Portal is now ready for production use on Railway!