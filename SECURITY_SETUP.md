# Security Setup Guide

## 1. Local Development

```bash
# Copy environment template
cp .env.example .env

# Generate session secret
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"

# Edit .env with your values (never commit this file)
```

## 2. Production Deployment (Railway)

Set these in Railway dashboard → Variables tab:

### Required

```bash
SESSION_SECRET=<64-char-hex-from-above>
ADMIN_USERNAME=<your-admin-username>
ADMIN_PASSWORD_HASH=<bcrypt-hash>
DATABASE_URL=<auto-provided-by-railway>
NODE_ENV=production
FRONTEND_URL=https://your-app.up.railway.app
```

Generate bcrypt hash:
```bash
node -e "require('bcryptjs').hash('your-password', 12, (e,h) => console.log(h))"
```

### Optional: Microsoft 365 SSO

```bash
AZURE_CLIENT_ID=<from-azure-portal>
AZURE_CLIENT_SECRET=<from-azure-portal>
AZURE_TENANT_ID=<from-azure-portal>
REDIRECT_URI=https://your-app.up.railway.app/api/auth/microsoft/callback
POST_LOGOUT_REDIRECT_URI=https://your-app.up.railway.app
```

### Optional: Statement Collection & SharePoint

```bash
STATEMENT_SENDER_EMAIL=compliance@company.com
STATEMENT_REQUEST_SCHEDULE=0 0 9 7 * *
STATEMENT_UPLOAD_DEADLINE_DAYS=14
AZURE_AD_EMPLOYEE_GROUP_ID=<group-id>
SHAREPOINT_SITE_URL=https://company.sharepoint.com/sites/compliance
SHAREPOINT_LIBRARY_NAME=Documents
SHAREPOINT_FOLDER_PATH=Trading Statements
SHAREPOINT_BACKUP_FOLDER_PATH=Database_Backups
```

### Optional: Backups & Strict Mode

```bash
BACKUP_SCHEDULE=0 0 * * * *
DISABLE_SCHEDULED_BACKUPS=false
RAILWAY_VOLUME_MOUNT_PATH=/data
SESSION_STORE_NO_FALLBACK=true
```

## 3. Security Best Practices

### Git Repository
- `.env` files are in `.gitignore` — never commit
- Use `.env.example` as template (no real values)
- Rotate secrets periodically

### Secret Management
- Use Railway's environment variables UI
- Use `ADMIN_PASSWORD_HASH` (bcrypt), not plaintext `ADMIN_PASSWORD`
- Different secrets per environment (dev/staging/prod)

### Session Security
```bash
# Strict mode: exit if database sessions fail
SESSION_STORE_NO_FALLBACK=true
```

## 4. Verification Checklist

- [ ] All `.env*` files excluded from Git
- [ ] Strong `SESSION_SECRET` (32+ chars, cryptographically random)
- [ ] Admin password hashed with bcrypt
- [ ] `DATABASE_URL` configured (auto by Railway)
- [ ] No hardcoded secrets in source code
- [ ] Azure credentials stored in Railway variables (if using SSO)
- [ ] HTTPS enabled (automatic on Railway)

## 5. Secret Rotation

1. Generate new `SESSION_SECRET`
2. Update in Railway dashboard
3. Service restarts automatically
4. All existing sessions invalidated (users must re-login)

## 6. Monitoring

Watch for these security events in logs:

| Event | Action Required |
|-------|----------------|
| `CSRF_VALIDATION_FAILED` | Investigate source IP |
| `UNAUTHORIZED_ADMIN_ACCESS` | Check for brute force |
| `UNAUTHORIZED_EMPLOYEE_ACCESS` | Verify session config |
| `SESSION_STORE_FALLBACK_TO_MEMORY` | Fix database connection immediately |

## Need Help?

- Railway docs: https://docs.railway.app/guides/variables
- Azure AD docs: https://learn.microsoft.com/en-us/entra/identity-platform/
- Security issues: Contact your security team immediately
