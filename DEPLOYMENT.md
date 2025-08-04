# 🚀 Trading Compliance Portal - Deployment Guide

## Quick Start

### 1. Clone Repository
```bash
git clone <your-github-url>
cd trading_approval
```

### 2. Install Dependencies
```bash
npm install
pip install -r requirements.txt
```

### 3. Environment Setup
```bash
cp .env.example .env
# Edit .env with your configuration
```

### 4. Start Application
```bash
npm start
```

## Environment Variables

### Required Configuration
```env
# Microsoft Azure AD (Required for employee authentication)
MSAL_CLIENT_ID=your_azure_app_client_id
MSAL_CLIENT_SECRET=your_azure_app_client_secret  
MSAL_TENANT_ID=your_azure_tenant_id
REDIRECT_URI=http://localhost:3001/auth/callback

# Admin Access (Change in production!)
ADMIN_USERNAME=admin
ADMIN_PASSWORD=your_secure_password

# Security
SESSION_SECRET=your_random_session_secret

# Application
PORT=3001
NODE_ENV=production
```

## Azure AD Setup (Required)

1. **Register App**: Azure Portal → Azure AD → App registrations → New
2. **Set Redirect URI**: `http://your-domain.com/auth/callback`
3. **API Permissions**: Add Microsoft Graph → User.Read, email, profile
4. **Client Secret**: Generate and copy to .env
5. **Copy IDs**: Client ID and Tenant ID to .env

## Production Deployment

### Railway/Heroku
1. Connect GitHub repository
2. Set environment variables in platform dashboard
3. Enable Python buildpack for stock data service
4. Deploy automatically on push to main branch

### Manual Server
1. Install Node.js 16+ and Python 3.7+
2. Clone repository and install dependencies
3. Set production environment variables
4. Use PM2 for process management:
   ```bash
   npm install -g pm2
   pm2 start src/app.js --name "trading-portal"
   ```

## Database

- **Development**: SQLite (auto-created)
- **Production**: SQLite (included) or upgrade to PostgreSQL
- **Initialization**: Automatic with default data

## Security Checklist

- ✅ Change default admin credentials
- ✅ Use secure session secret (32+ characters)
- ✅ Configure proper Azure AD redirect URI
- ✅ Enable HTTPS in production
- ✅ Set NODE_ENV=production

## Monitoring & Logs

The application includes comprehensive audit logging:
- All user activities logged with Hong Kong timezone
- Admin actions tracked with detailed context
- CSV export capabilities for compliance
- Real-time system activity monitoring

## Support

- **Stock Data**: Automatic via yfinance (no API key needed)
- **Authentication**: Microsoft 365 corporate accounts only
- **Database**: Auto-initializes with compliance settings
- **Audit**: Complete activity logging built-in

Ready for production! 🎉