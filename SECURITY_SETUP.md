# Security Setup Guide

## Environment Variables Security

### ⚠️ Important: Never Commit Secrets

This application uses environment variables for sensitive configuration. Follow these steps to secure your deployment:

## 1. Local Development

1. Copy `.env.example` to `.env`:
   ```bash
   cp .env.example .env
   ```

2. Generate a secure session secret:
   ```bash
   openssl rand -base64 32
   ```

3. Update `.env` with your values (never commit this file)

## 2. Production Deployment (Railway)

### Required Environment Variables

Set these in Railway's dashboard (Settings → Variables):

```bash
# Required Security Variables
SESSION_SECRET=<generate-with-openssl-rand-base64-32>
ADMIN_USERNAME=<your-admin-username>
ADMIN_PASSWORD=<strong-password>

# Database (Railway provides automatically)
DATABASE_URL=<auto-provided-by-railway>

# Application
NODE_ENV=production
PORT=3000
FRONTEND_URL=https://your-app.railway.app
```

### Optional: Microsoft 365 SSO

Only add if using SSO authentication:

```bash
AZURE_CLIENT_ID=<from-azure-portal>
AZURE_CLIENT_SECRET=<from-azure-portal>
AZURE_TENANT_ID=<from-azure-portal>
REDIRECT_URI=https://your-app.railway.app/api/auth/microsoft/callback
POST_LOGOUT_REDIRECT_URI=https://your-app.railway.app
```

## 3. Security Best Practices

### Git Repository
- ✅ `.env` files are in `.gitignore`
- ✅ Never commit real credentials
- ✅ Use `.env.example` as template
- ✅ Rotate secrets regularly

### Secret Management
- Use Railway's environment variables UI
- Consider Azure Key Vault for enterprise
- Enable audit logging for secret access
- Use different secrets per environment

### Session Security
```bash
# For strict production environments
SESSION_STORE_NO_FALLBACK=true
```

This prevents fallback to memory sessions if database fails.

## 4. Verification Checklist

Before deploying:
- [ ] All `.env*` files removed from Git history
- [ ] Strong SESSION_SECRET generated (32+ chars)
- [ ] Admin password is strong and unique
- [ ] Database URL configured in Railway
- [ ] No hardcoded secrets in source code
- [ ] Azure credentials stored securely (if using SSO)

## 5. Secret Rotation

Rotate secrets periodically:
1. Generate new SESSION_SECRET
2. Update in Railway dashboard
3. Restart application
4. Monitor for session issues

## 6. Monitoring

Watch for these security events in logs:
- `CSRF_VALIDATION_FAILED`
- `AUTH_RATE_LIMIT_EXCEEDED`
- `UNAUTHORIZED_ADMIN_ACCESS`
- `SESSION_STORE_FALLBACK_TO_MEMORY`

## Need Help?

- Railway Docs: https://docs.railway.app/guides/variables
- Azure Key Vault: https://azure.microsoft.com/services/key-vault/
- Security Issues: Contact your security team immediately