# Employee Trading Approval Portal

A comprehensive enterprise-grade employee pre-trading approval system with Microsoft 365 integration, built for compliance and audit requirements. Features brokerage account management, monthly statement collection, automated backups, and complete audit trails for regulatory compliance.

## Key Features

### Core Trading Functionality
- **Employee Portal**: Trading request submission with real-time ticker/ISIN validation
- **Bond, Equity & ETF Support**: ISIN validation for bonds, ticker validation for equities and ETFs
- **Two-Step Workflow**: Preview → Compliance Declaration → Submit → Result confirmation
- **Automatic Processing**: Real-time approval/rejection based on restricted instruments list
- **Currency Conversion**: Automatic USD conversion for international stocks with live exchange rates
- **Escalation System**: Business justification workflow for declined trades with admin priority review
- **30-Day Holding Rule**: Auto-escalation when trading the same ticker in opposite direction within 30 days (SFC FMCC compliance), with delayed auto-approval after 30–60 minute review period
- **Historical Data Migration**: Import pre-trade approvals from SharePoint/Microsoft Forms with automatic ticker resolution

### Brokerage Account Management
- **Self-Service Registry**: Employees register their brokerage accounts (firm name + account number)
- **Mandatory Onboarding**: New employees must register at least one account before accessing the dashboard
- **Monthly Confirmation**: All employees confirm accounts are current every 30 days
- **Account Selection**: Choose brokerage account when submitting trades or uploading statements

### Monthly Statement Collection
- **Scheduled Email Requests**: Automatic emails on configurable schedule (default: 7th of each month)
- **Token-Based Upload**: Employees receive secure upload links via email
- **Self-Service Upload**: Upload trading statements with brokerage account selection
- **SharePoint Integration**: Statements stored in employee-first folder structure (`{employee}/{YYYY-MM}/`)
- **Secure File Viewing**: Files served via authenticated proxy — no direct SharePoint access needed
- **Deadline Tracking**: Configurable deadlines with automated daily reminder emails
- **Admin Dashboard**: View upload status per employee, resend emails, manual trigger
- **SharePoint Diagnostics**: Admin "Test SharePoint Connection" for step-by-step connectivity checks

### Automated Database Backups
- **Scheduled Backups**: Configurable schedule via cron (default: hourly)
- **SharePoint Upload**: Backups automatically uploaded to SharePoint for secure off-site storage
- **SQL Export**: Full database dump in portable SQL format
- **Manual Backup**: Admin can trigger backups on demand
- **Railway Volume Support**: Persistent local storage with Railway volumes

### Authentication & Security
- **Microsoft 365 SSO**: Optional Azure AD single sign-on
- **Conditional Authentication**: Automatically switches between SSO and demo mode
- **Content Security Policy**: `script-src: 'none'` — no JavaScript execution allowed
- **CSRF Protection**: Token-based protection with timing-safe comparison on all forms
- **Rate Limiting**: Configurable limits for auth (5/15min), general (1000/15min), admin actions (10/min)
- **Audit Trail**: Complete activity logging with IP addresses, session IDs, and user actions

### Admin Management
- **Dashboard**: Pending request counts, system status, quick actions
- **Trading Requests**: View/approve/reject with sorting, filtering, and CSV export
- **Restricted Instruments**: Add/remove stocks and bonds with full changelog
- **Audit Log**: Comprehensive activity log with advanced filters and CSV export
- **Statement Management**: View statement request status, resend emails, trigger collections
- **Database Backup**: Manual backup, backup history, database clear with confirmation

## Architecture

```
Controllers (HTTP handling)
    ↓
Services (Business logic)
    ↓
Models (Data access)
    ↓
Middleware (Security, validation, upload)
```

### Technology Stack
- **Backend**: Node.js 20+ with Express.js 5
- **Database**: PostgreSQL with UUID primary keys and TIMESTAMPTZ columns
- **Authentication**: Microsoft 365 OAuth 2.0 (optional) + admin credentials
- **Frontend**: Server-side rendering, pure HTML/CSS (no JavaScript — strict CSP)
- **Email**: Microsoft Graph API for statement request emails
- **Storage**: SharePoint REST API for statements and backups (with proxy file access)
- **Scheduling**: node-cron for backups and statement requests
- **Deployment**: Railway with Docker, auto-scaling

## Quick Start

### Deploy to Railway

1. **Connect Repository**: Link your GitHub repository to Railway
2. **Add PostgreSQL**: Railway provides `DATABASE_URL` automatically
3. **Configure Environment**: Set required variables (see below)
4. **Deploy**: Railway detects Node.js and deploys automatically

### Required Environment Variables

```bash
# Core (Required)
NODE_ENV=production
SESSION_SECRET=<generate-with: node -e "console.log(require('crypto').randomBytes(32).toString('hex'))">
ADMIN_USERNAME=admin
ADMIN_PASSWORD_HASH=<bcrypt-hash-of-password>
DATABASE_URL=postgresql://...  # Auto-provided by Railway
FRONTEND_URL=https://pa-approval.inspirationcap.com
```

### Microsoft 365 SSO (Optional)

```bash
AZURE_CLIENT_ID=<from-azure-portal>
AZURE_CLIENT_SECRET=<from-azure-portal>
AZURE_TENANT_ID=<from-azure-portal>
REDIRECT_URI=https://pa-approval.inspirationcap.com/api/auth/microsoft/callback
POST_LOGOUT_REDIRECT_URI=https://pa-approval.inspirationcap.com
```

### Statement Collection (Optional — requires Microsoft 365)

```bash
STATEMENT_SENDER_EMAIL=compliance@company.com        # Licensed M365 mailbox
STATEMENT_REQUEST_SCHEDULE=0 0 9 7 * *               # 7th of month, 9 AM (cron)
STATEMENT_UPLOAD_DEADLINE_DAYS=14                     # Days to submit
AZURE_AD_EMPLOYEE_GROUP_ID=<azure-ad-group-id>        # Filter employees by group
```

### SharePoint Integration (Optional — requires Microsoft 365)

```bash
SHAREPOINT_SITE_URL=https://company.sharepoint.com/sites/compliance
SHAREPOINT_LIBRARY_NAME=Documents                         # Library display name
SHAREPOINT_FOLDER_PATH=Trading_Approval                    # Statement folder (employee/{YYYY-MM}/ subfolders)
SHAREPOINT_BACKUP_FOLDER_PATH=Trading_Approval/Database_Backups  # Backup folder ({YYYY-MM}/ subfolders)
```

### Scheduled Backups

```bash
BACKUP_SCHEDULE=0 0 * * * *           # Hourly (cron format)
DISABLE_SCHEDULED_BACKUPS=false       # Set true to disable
RAILWAY_VOLUME_MOUNT_PATH=/data       # Persistent volume path
```

### Other Options

```bash
PORT=3001                             # Server port (default: 3001)
LOG_LEVEL=info                        # debug/info/warn/error
SESSION_STORE_NO_FALLBACK=true        # Exit if DB sessions fail
DISABLE_STATEMENT_REQUESTS=true       # Disable statement feature
```

## API Endpoints

### Authentication
| Method | Path | Description |
|--------|------|-------------|
| GET | `/` | Landing page with conditional SSO login |
| GET | `/api/auth/microsoft/login` | Start Microsoft 365 OAuth flow |
| GET | `/api/auth/microsoft/callback` | OAuth callback handler |
| POST | `/admin-authenticate` | Admin credential login |
| GET | `/employee-dummy-login` | Demo login (when SSO disabled) |

### Employee Portal
| Method | Path | Description |
|--------|------|-------------|
| GET | `/employee-dashboard` | Trading request form |
| GET | `/employee-history` | Personal trading history |
| GET | `/employee-export-history` | CSV export of history |
| POST | `/preview-trade` | Preview trade with compliance check |
| POST | `/submit-trade` | Submit after confirmation |
| GET | `/trade-result/:id` | Approval/rejection result |
| GET | `/escalate-form/:id` | Escalation form |
| POST | `/submit-escalation` | Submit escalation |

### Brokerage Accounts
| Method | Path | Description |
|--------|------|-------------|
| GET | `/employee-brokerage-accounts` | View/manage accounts |
| POST | `/employee-add-brokerage` | Register new account |
| POST | `/employee-remove-brokerage` | Remove an account |
| POST | `/employee-confirm-accounts` | Monthly confirmation |

### Statement Uploads
| Method | Path | Description |
|--------|------|-------------|
| GET | `/employee-upload-statement` | Upload form |
| POST | `/employee-upload-statement` | Submit statement file |
| GET | `/statement-file/:uuid` | View uploaded file (proxy via SharePoint) |

### Admin Management
| Method | Path | Description |
|--------|------|-------------|
| GET | `/admin-dashboard` | Admin dashboard |
| GET | `/admin-requests` | Trading requests with filters |
| GET | `/admin-restricted-stocks` | Restricted instruments list |
| GET | `/admin-audit-log` | Audit trail with export |
| GET | `/admin-statements` | Statement request dashboard |
| POST | `/admin-add-stock` | Add restricted instrument |
| POST | `/admin-remove-stock` | Remove restricted instrument |
| POST | `/admin-approve-request` | Approve trading request |
| POST | `/admin-reject-request` | Reject trading request |
| POST | `/admin-test-sharepoint` | Test SharePoint connectivity |
| GET | `/admin-backup-database` | Download database backup |

### System
| Method | Path | Description |
|--------|------|-------------|
| GET | `/health` | Health check (always 200) |
| GET | `/metrics` | Application metrics (no PII) |

## Database Schema

### Core Tables
| Table | Purpose |
|-------|---------|
| `trading_requests` | Trading request records with status tracking |
| `restricted_stocks` | Restricted instruments list (stocks, bonds) |
| `restricted_stock_changelog` | Audit trail of restricted list changes |
| `audit_logs` | Complete activity logging |
| `brokerage_accounts` | Employee brokerage account registry |
| `employee_profiles` | Onboarding and monthly confirmation tracking |
| `statement_requests` | Monthly statement collection tracking |
| `session` | PostgreSQL session store |

All tables use UUID primary keys and TIMESTAMPTZ columns for proper timezone handling.

### Migrations

15 migration files in `/migrations/` run automatically on startup. The `run-migrations.js` runner executes them in order and handles idempotent re-runs gracefully.

### Scripts

| Script | Description |
|--------|-------------|
| `scripts/migrate-pretrade-approvals.js` | Import historical pre-trade approvals from SharePoint/Microsoft Forms |
| `scripts/migrate-pretrade-approvals.js --dry-run` | Preview migration without inserting |
| `scripts/migrate-pretrade-approvals.js --flag-short-term` | Retroactively flag 30-day holding rule violations |

## Local Development

```bash
# Clone and install
git clone https://github.com/timlihk/Employe-Trading-Approval-Portal.git
cd trading-approval
npm install

# Configure environment
cp .env.example .env
# Edit .env with your DATABASE_URL, SESSION_SECRET, ADMIN_USERNAME, ADMIN_PASSWORD

# Start server
npm start

# Run tests
npm test
npm run test:coverage
```

### Docker Compose (Local)

```bash
docker-compose up    # Starts PostgreSQL + app + nginx
```

## Employee Workflow

1. **Login** via Microsoft 365 SSO or demo mode
2. **Onboarding** (first time): Register at least one brokerage account
3. **Monthly Confirmation**: Confirm accounts are current every 30 days
4. **Submit Trade**: Fill form → Preview → Declare compliance → Submit
5. **View Result**: Automatic approval or rejection with reason
6. **Escalate** (if rejected): Provide business justification for admin review
7. **Upload Statements**: Monthly statement uploads when requested

## Security

- **CSP**: `script-src: 'none'` — zero JavaScript execution, all interactivity is CSS-only or server-side
- **Sessions**: PostgreSQL-backed with secure cookies (HttpOnly, Secure, SameSite=lax)
- **CSRF**: Cryptographic tokens on all POST forms with timing-safe comparison
- **Rate Limiting**: Auth (5/15min), general (1000/15min), admin actions (10/min)
- **Input Validation**: express-validator with parameterized SQL queries throughout
- **Audit Logging**: All actions logged with IP, session ID, and user agent
- **Password Hashing**: bcrypt with configurable rounds for admin credentials

See [SECURITY.md](./SECURITY.md) for full security policy and [SECURITY_SETUP.md](./SECURITY_SETUP.md) for setup guide.

## Documentation

| Document | Description |
|----------|-------------|
| [CLAUDE.md](./CLAUDE.md) | Architecture guidelines and development patterns |
| [DEPLOYMENT.md](./DEPLOYMENT.md) | Railway deployment guide |
| [DEVELOPMENT.md](./DEVELOPMENT.md) | Optimization roadmap and code quality standards |
| [SECURITY.md](./SECURITY.md) | Security policy and monitoring events |
| [SECURITY_SETUP.md](./SECURITY_SETUP.md) | Environment variable and secrets setup |
| [RAILWAY_VOLUME_SETUP.md](./RAILWAY_VOLUME_SETUP.md) | Persistent volume configuration |

## Version History

| Version | Highlights |
|---------|------------|
| v3.2.0 | 30-day short-term trading detection with auto-escalation, SharePoint historical data migration, UI refinements |
| v3.1.0 | SharePoint file proxy, employee-first folder structure, SharePoint diagnostics, performance caching, user guides |
| v3.0.0 | Brokerage accounts, employee onboarding, statement collection, automated backups, UI redesign, database performance |
| v2.5.0 | Code quality refactoring, CSS minification, testing framework |
| v2.4.0 | CSP hardening, security improvements |
| v2.3.0 | Performance indexes, cache management |
| v2.2.0 | UI improvements, error handling |
| v2.1.0 | Initial release with core trading workflow |

---

*Last Updated: February 2026 — Version 3.2.0*
