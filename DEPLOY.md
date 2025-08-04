# Railway Deployment Guide

This guide explains how to deploy the Employee Pre-Trading Approval Request system to Railway.

## Prerequisites

1. **Railway Account**: Sign up at [railway.app](https://railway.app)
2. **GitHub Repository**: Push your code to GitHub
3. **Environment Variables**: Prepare your production environment variables

## Deployment Steps

### 1. Connect GitHub Repository

1. Go to [railway.app](https://railway.app)
2. Click "Start a New Project"
3. Select "Deploy from GitHub repo"
4. Choose your repository with this code

### 2. Configure Environment Variables

In Railway dashboard, go to your project → Variables and add:

**Required Variables:**
```
NODE_ENV=production
SESSION_SECRET=your-super-secure-random-string-here
ADMIN_USERNAME=admin
ADMIN_PASSWORD=your-secure-admin-password
FRONTEND_URL=https://your-app-name.railway.app
```

**Optional Variables (for Microsoft 365 auth):**
```
AZURE_CLIENT_ID=your-azure-app-client-id
AZURE_CLIENT_SECRET=your-azure-app-client-secret
AZURE_TENANT_ID=your-azure-tenant-id
AZURE_REDIRECT_URL=https://your-app-name.railway.app/api/auth/microsoft/callback
```

**Optional Variables (for email notifications):**
```
EMAIL_FROM=noreply@yourcompany.com
EMAIL_HOST=smtp.gmail.com
EMAIL_PORT=587
EMAIL_USER=your-email@gmail.com
EMAIL_PASS=your-email-app-password
```

### 3. Deploy

1. Railway will automatically detect the Node.js app
2. It will install dependencies and deploy
3. You'll get a URL like `https://your-app-name.railway.app`

### 4. Verify Deployment

1. Visit your Railway URL
2. Test the admin login with your configured credentials
3. Verify stock ticker lookup works
4. Test trade request submission

## Features Included

✅ **Stock Price Integration**: Real-time stock prices via yfinance
✅ **Trade Value Calculation**: Automatic calculation based on shares × price
✅ **Compliance Validation**: Max trade amount enforcement
✅ **Admin Dashboard**: Complete admin panel with audit logs
✅ **Microsoft 365 Auth**: Optional employee authentication
✅ **Audit Logging**: Complete activity tracking
✅ **Data Export**: CSV export for compliance reporting

## Default Admin Access

- **URL**: `https://your-app-name.railway.app`
- **Username**: Value of `ADMIN_USERNAME` environment variable
- **Password**: Value of `ADMIN_PASSWORD` environment variable

## Security Notes

1. **Change default passwords** immediately after deployment
2. **Use strong session secrets** (random 32+ character strings)
3. **Enable HTTPS** (Railway provides this automatically)
4. **Set up proper Microsoft 365 app** if using employee authentication

## Support

The system includes:
- SQLite database (automatically created)
- Python virtual environment for stock data
- All dependencies configured
- Production-ready configuration

For issues, check Railway logs in the dashboard.