# Railway Deployment Guide

## Prerequisites

1. GitHub account with the repository
2. Railway account ([railway.app](https://railway.app))
3. PostgreSQL database (Railway provides automatically)
4. Optional: Azure AD app registration for Microsoft 365 SSO

## Step 1: Connect to Railway

1. Go to [railway.app](https://railway.app) and sign in with GitHub
2. Click "New Project" → "Deploy from GitHub repo"
3. Select your trading approval repository
4. Click "Deploy Now"

Railway automatically detects Node.js, installs dependencies, and starts the app.

## Step 2: Add PostgreSQL

1. In your Railway project, click "New" → "Database" → "PostgreSQL"
2. Railway automatically sets `DATABASE_URL` for your service
3. The app creates all tables on first startup

## Step 3: Configure Environment Variables

In your Railway service → Variables tab, add:

### Required

```bash
NODE_ENV=production
SESSION_SECRET=<generate: node -e "console.log(require('crypto').randomBytes(32).toString('hex'))">
ADMIN_USERNAME=admin
ADMIN_PASSWORD_HASH=<generate: node -e "require('bcryptjs').hash('your-password', 12, (e,h) => console.log(h))">
FRONTEND_URL=https://pa-approval.inspirationcap.com
```

`DATABASE_URL` is auto-provided by Railway — do not set manually.

### Optional: Microsoft 365 SSO

```bash
AZURE_CLIENT_ID=<from-azure-portal>
AZURE_CLIENT_SECRET=<from-azure-portal>
AZURE_TENANT_ID=<from-azure-portal>
REDIRECT_URI=https://pa-approval.inspirationcap.com/api/auth/microsoft/callback
POST_LOGOUT_REDIRECT_URI=https://pa-approval.inspirationcap.com
```

Azure AD setup:
1. Go to [portal.azure.com](https://portal.azure.com) → App registrations
2. Create new registration with redirect URI (Web): your callback URL
3. Create client secret in Certificates & secrets
4. Copy Client ID, Client Secret, Tenant ID to Railway variables

### Optional: Statement Collection (requires Microsoft 365)

```bash
STATEMENT_SENDER_EMAIL=compliance@company.com
STATEMENT_REQUEST_SCHEDULE=0 0 9 7 * *
STATEMENT_UPLOAD_DEADLINE_DAYS=14
AZURE_AD_EMPLOYEE_GROUP_ID=<group-id>
```

### Optional: SharePoint Integration (requires Microsoft 365)

```bash
SHAREPOINT_SITE_URL=https://company.sharepoint.com/sites/compliance
SHAREPOINT_LIBRARY_NAME=Documents                         # Display name (not "Shared Documents")
SHAREPOINT_FOLDER_PATH=Trading_Approval                    # Statements: {path}/{employee}/{YYYY-MM}/
SHAREPOINT_BACKUP_FOLDER_PATH=Trading_Approval/Database_Backups  # Backups: {path}/{YYYY-MM}/
```

**SharePoint folder structure (auto-created):**
```
Documents/
  Trading_Approval/
    john.doe/
      2026-01/
        brokerage_timestamp_statement.pdf
    Database_Backups/
      2026-02/
        db_backup_2026-02-27T09-00-00.sql
```

### Optional: Backups

```bash
BACKUP_SCHEDULE=0 0 * * * *
DISABLE_SCHEDULED_BACKUPS=false
```

For persistent backup storage, see [RAILWAY_VOLUME_SETUP.md](./RAILWAY_VOLUME_SETUP.md).

### Optional: Strict Mode

```bash
SESSION_STORE_NO_FALLBACK=true    # Exit if PostgreSQL sessions fail
LOG_LEVEL=info                     # debug/info/warn/error
```

## Step 4: Verify Deployment

1. Check deployment logs for successful startup
2. Visit your app URL — landing page should load
3. Test health endpoint: `https://pa-approval.inspirationcap.com/health`
4. Log in as admin with configured credentials
5. Test employee login (SSO or demo mode)

## Step 5: Initial Setup

1. **Admin login**: Use configured credentials
2. **Add restricted stocks**: Admin → Restricted Stocks → Add instruments
3. **Test employee flow**: Submit a trading request → verify approval/rejection
4. **Verify audit log**: Admin → Audit Log → confirm actions are logged

## Database Management

- **Auto-initialization**: Tables created on first startup
- **Migrations**: Run automatically on production startup via `run-migrations.js`
- **Backups**: Configurable schedule (default: hourly) with SharePoint upload
- **Manual backup**: Admin dashboard → Download database backup
- **Health check**: `/health` endpoint reports database status

### Data Migration (Historical Records)

Import historical pre-trade approvals from SharePoint/Microsoft Forms:

```bash
# Preview what will be imported (no database changes)
node scripts/migrate-pretrade-approvals.js --dry-run

# Run the migration
node scripts/migrate-pretrade-approvals.js

# Retroactively flag 30-day holding rule violations on imported records
node scripts/migrate-pretrade-approvals.js --flag-short-term --dry-run
node scripts/migrate-pretrade-approvals.js --flag-short-term
```

The migration script resolves company names to tickers via Yahoo Finance search API with a manual mapping table for edge cases (typos, non-US exchanges, private companies).

### Announcement Emails

Send one-time announcement email to all employees (fetched from Azure AD):

```bash
# Preview recipients (no emails sent)
railway run node scripts/send-announcement.js --dry-run

# Send to all employees
railway run node scripts/send-announcement.js
```

Requires `AZURE_CLIENT_ID`, `AZURE_CLIENT_SECRET`, `AZURE_TENANT_ID`, and `STATEMENT_SENDER_EMAIL`.

Edit the HTML template and subject in `scripts/send-announcement.js` before sending.

### Custom Domain Setup

To use a custom domain (e.g., `pa-approval.inspirationcap.com`):

1. **DNS**: Add a CNAME record pointing your subdomain to the Railway-provided domain
2. **Railway**: Add the custom domain in Service → Settings → Networking → Custom Domain
3. **SSL**: Railway provisions a certificate automatically
4. **Environment**: Update `FRONTEND_URL`, `REDIRECT_URI`, and `POST_LOGOUT_REDIRECT_URI` in Railway variables
5. **Azure AD**: Update the redirect URI in your Azure AD app registration

## Monitoring

Railway provides:
- **Logs**: Real-time application logs
- **Metrics**: CPU, memory, network usage
- **Health checks**: Automatic monitoring via `/health`
- **Deployments**: History with rollback capability

Application provides:
- `/health` — database status, uptime
- `/metrics` — query counts, cache stats, error rates (no PII)
- Admin audit log — complete activity tracking

## Troubleshooting

### App won't start / health check fails
- Check logs for error messages
- Verify `DATABASE_URL` is set (auto-provided by Railway PostgreSQL)
- Check for migration errors in logs (e.g., "functions in index expression must be marked IMMUTABLE")
- Ensure `SESSION_SECRET` is set

### Microsoft 365 login fails
- Verify redirect URI matches exactly (including trailing slash)
- Check Azure AD app registration is configured correctly
- Ensure client secret hasn't expired

### SharePoint upload/download not working
- Use admin "Test SharePoint Connection" button (Scheduler Settings page) for step-by-step diagnostics
- `SHAREPOINT_LIBRARY_NAME` must match the library's **display name** (usually "Documents", not "Shared Documents")
- Verify Azure AD app has `Sites.ReadWrite.All` application permission
- Check logs for specific Graph API error messages

### Backups not working
- Verify SharePoint variables are set if using SharePoint upload
- Check Railway volume is mounted if using persistent storage
- Review logs for "backup" related errors

### Statement emails not sending
- Requires `AZURE_CLIENT_ID`, `AZURE_CLIENT_SECRET`, `AZURE_TENANT_ID`
- Requires `STATEMENT_SENDER_EMAIL` (must be a licensed M365 mailbox)
- Check `DISABLE_STATEMENT_REQUESTS` is not `true`
- Review logs for Graph API errors

### Database issues
- Railway PostgreSQL is managed — check Railway dashboard for DB status
- App creates tables automatically — no manual schema setup needed
- For schema issues, check migration logs on startup

## Security Checklist

Before going live:

- [ ] Strong `SESSION_SECRET` (32+ chars, cryptographically secure)
- [ ] `ADMIN_PASSWORD_HASH` set (bcrypt, not plaintext)
- [ ] HTTPS enabled (automatic on Railway)
- [ ] `SESSION_STORE_NO_FALLBACK=true` for strict environments
- [ ] Microsoft 365 redirect URIs match deployment URL
- [ ] Rate limiting active (default configuration)
- [ ] Audit logging confirmed working
- [ ] Backup schedule configured
- [ ] Test complete employee workflow
- [ ] Test admin approval/rejection workflow
- [ ] Review application logs for warnings

## Architecture Notes

This application requires a traditional server (NOT serverless) because:
- Stateful sessions with PostgreSQL backing
- Long-running scheduled tasks (backups, statement emails)
- Persistent database connections with connection pooling
- File upload handling with temporary storage
