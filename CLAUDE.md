# CLAUDE.md - Project Memory & Guidelines

## Project Overview

**Employee Trading Approval Portal** — A compliance-focused web application for managing employee stock/bond trading requests with automatic approval/rejection based on restricted lists, brokerage account management, monthly statement collection, and automated backups.

### Architecture
- **Backend**: Node.js 20+ with Express.js 5 (traditional server, NOT serverless)
- **Database**: PostgreSQL with UUID primary keys and TIMESTAMPTZ columns
- **Frontend**: Server-side rendering with template strings (no React/Vue/JS)
- **Authentication**: Microsoft 365 SSO (optional) + email-based demo mode
- **Email**: Microsoft Graph API for statement request emails
- **Storage**: SharePoint REST API for statements and backups (with proxy file access via `/statement-file/:uuid`)
- **Scheduling**: node-cron for automated backups and statement requests
- **Deployment**: Railway (NOT Vercel — stateful, long-running processes)

---

## Critical Security Constraints

### STRICT Content Security Policy (CSP)
```javascript
// src/app.js
contentSecurityPolicy: {
  scriptSrc: ["'none'"],              // NO JavaScript allowed AT ALL
  styleSrc: ["'self'", "https://fonts.googleapis.com"],
  fontSrc: ["'self'", "https:", "data:"],
  defaultSrc: ["'self'"],
  objectSrc: ["'none'"]
}
```

### NEVER ADD:
- Inline JavaScript (`onclick`, `onchange`, `<script>`)
- External JavaScript libraries
- `javascript:` links
- Inline `style` attributes — use CSS classes only

### ALLOWED APPROACHES:
- Pure CSS solutions (`:checked`, `:hover`, `:target`, etc.)
- Hidden checkboxes + labels for toggles
- Server-side form handling with redirects
- CSS-only animations and interactions

---

## Project Structure

```
src/
├── app.js                              # Main server (routes, middleware, startup)
├── config/
│   └── msalConfig.js                   # Azure AD OAuth configuration
├── controllers/
│   ├── AdminController.js              # Admin dashboard, requests, stocks, audit
│   ├── EmployeeController.js           # Employee dashboard, history, brokerage, onboarding
│   ├── TradingRequestController.js     # Trade preview, submit, escalation
│   └── StatementController.js          # Statement requests and uploads
├── middleware/
│   ├── errorHandler.js                 # AppError class, catchAsync, global handler
│   ├── security.js                     # Rate limiting (general, auth, admin)
│   ├── upload.js                       # Multer file upload middleware
│   └── validation.js                   # express-validator rules
├── models/
│   ├── database.js                     # PostgreSQL pool, schema init, query helpers
│   ├── BaseModel.js                    # Base class with query/get/run/findById
│   ├── TradingRequest.js               # Trading requests CRUD + filtering
│   ├── RestrictedStock.js              # Restricted instruments list
│   ├── RestrictedStockChangelog.js      # Restricted list audit trail
│   ├── AuditLog.js                     # Activity logging with filters
│   ├── BrokerageAccount.js             # Employee brokerage account registry
│   ├── EmployeeProfile.js              # Onboarding + monthly confirmation
│   └── StatementRequest.js             # Monthly statement tracking
├── services/
│   ├── TradingRequestService.js        # Core trading logic (validation, approval, 30-day detection)
│   ├── AdminService.js                 # Admin authentication
│   ├── BackupService.js                # SQL backup generation
│   ├── CurrencyService.js              # Exchange rate fetching + caching
│   ├── GraphAPIService.js              # Microsoft Graph (email, SharePoint, AD)
│   ├── ISINService.js                  # Bond ISIN validation
│   ├── ScheduledBackupService.js       # Cron-based backup scheduling
│   ├── ScheduledStatementService.js    # Monthly statement email scheduler
│   ├── StatementRequestService.js      # Statement workflow logic
│   └── MockDataService.js              # Demo data generation
├── templates/
│   ├── admin/                          # Admin page templates (9 files)
│   │   ├── auditLog.js, backupList.js, backupScheduler.js, clearDatabase.js
│   │   ├── dashboard.js, login.js, rejectForm.js, requests.js, restrictedStocks.js
│   ├── employee/                       # Employee page templates (5 files)
│   │   ├── brokerageAccounts.js, dashboard.js, escalation.js, history.js, uploadStatement.js
│   ├── trading/                        # Trading flow templates
│   │   ├── preview.js, result.js
│   ├── statement/                      # Statement templates
│   │   ├── adminDashboard.js, invalidLink.js, scheduler.js, uploadComplete.js, uploadForm.js
│   └── shared/                         # Shared template helpers
│       ├── formatters.js               # formatHongKongTime, getSortDisplayName
│       └── sorting.js                  # generateSortableHeader, generateSortingControls
├── routes/
│   ├── authRoutes.js                   # Auth endpoint definitions
│   └── systemRoutes.js                 # Health + metrics endpoints
└── utils/
    ├── templates.js                    # HTML page rendering (base, admin, employee)
    ├── formatters.js                   # escapeHtml, formatUuid, getDisplayId
    ├── logger.js                       # Winston structured logging
    ├── metrics.js                      # Application metrics tracking
    ├── simpleCache.js                  # LRU cache with TTL
    └── retryBreaker.js                 # Circuit breaker + retry logic
```

---

## Database

### Tables
| Table | Key columns |
|-------|-------------|
| `trading_requests` | uuid, employee_email, ticker, shares, trading_type, status, instrument_type, escalated, escalation_reason |
| `restricted_stocks` | uuid, ticker, company_name, instrument_type |
| `restricted_stock_changelog` | uuid, ticker, action (added/removed), admin_email |
| `audit_logs` | uuid, user_email, user_type, action, target_type, details |
| `brokerage_accounts` | uuid, employee_email, firm_name, account_number |
| `employee_profiles` | uuid, employee_email, accounts_confirmed_at |
| `statement_requests` | uuid, employee_email, period_year/month, status, upload_token |
| `session` | sid, sess, expire |

### Key patterns
- **UUID primary keys** everywhere (not auto-increment)
- **TIMESTAMPTZ** for all date columns (timezone-aware)
- **Sargable queries**: Use `created_at >= ($1::date AT TIME ZONE 'Asia/Hong_Kong')` instead of `DATE(created_at AT TIME ZONE ...)`
- **BaseModel** uses `WHERE uuid = $1` for findById/update/delete
- **database.run()** auto-appends `RETURNING uuid` to INSERTs — models using `RETURNING *` should use `query()` instead

### Schema initialization
- `database.js` constructor calls `init()` (async, not awaited) to CREATE tables, ADD columns, CREATE indexes
- `run-migrations.js` runs SQL migration files on production startup
- Both are idempotent (IF NOT EXISTS, try/catch for already-applied changes)

---

## Middleware Chain (Employee Routes)

```
requireEmployee → requireBrokerageSetup → handler

requireEmployee: checks req.session.employee exists
requireBrokerageSetup:
  - 0 accounts → redirect /employee-brokerage-accounts?setup=required
  - Not confirmed in 30 days → redirect /employee-brokerage-accounts?confirm=required
  - Error → graceful degradation (next())
```

Exempt from `requireBrokerageSetup`: brokerage CRUD routes, confirm-accounts, logout.

---

## UI Patterns

### CSS files (public/css/ — 16 modular files)
Numbered for load order: `01-tokens.css` through `16-print.css`. Run `npm run css:build` to concatenate and minify to `styles-modern.min.css`.

### CSS classes
- Alerts: `alert-success alert`, `alert-error alert`, `alert-info alert`, `alert-warning alert`
- Status badges: `status-approved`, `status-rejected`, `status-pending`
- Cards: `card`, `card-header`, `card-body`, `card-title`
- Tables: `modern-table`, `table-container`
- Layout: `container`, `main-content`, `site-header`, `site-footer`
- Navigation: `nav`, `nav-link`, `nav-link.active`
- Forms: `form-group`, `form-label`, `form-input`, `form-select`
- Buttons: `btn`, `btn-primary`, `btn-danger`, `btn-secondary`
- Utility: `mb-6`, `mt-2`, `p-6`, `text-center`, `text-muted`, `font-sm`
- Filter grid: `grid-filters` (6-column `repeat(6, 1fr)` for inline filter rows, inputs auto-fill with `width: 100%`)

### Template helpers (src/utils/templates.js)
- `renderBasePage(title, subtitle, content, navigation)`
- `renderAdminPage(title, content)` — includes admin nav with active state
- `renderEmployeePage(title, content, name, email)` — includes employee nav
- `renderPublicPage(title, content)` — no navigation
- `generateNotificationBanner(query)` — reads `?message=` or `?error=` from URL
- `renderCard(title, content, subtitle)` — card component
- `renderTable(headers, rows, emptyMessage)` — table with thead/tbody

### Notification messages (via query params)
Success (`?message=`): `stock_added`, `stock_removed`, `request_approved`, `request_rejected`, `escalation_submitted`, `statement_uploaded`, `accounts_confirmed`, `database_cleared`, `statement_emails_sent`, `statement_email_resent`, `admin_logged_out`

### Announcement Emails
One-time script `scripts/send-announcement.js` sends HTML email to all employees via Graph API:
- Uses `GraphAPIService.getEmployees()` and `GraphAPIService.sendEmail()`
- Supports `--dry-run` to preview recipients
- Run via `railway run node scripts/send-announcement.js`
- Requires `AZURE_CLIENT_ID`, `AZURE_CLIENT_SECRET`, `AZURE_TENANT_ID`, `STATEMENT_SENDER_EMAIL`

### 30-Day Short-Term Trading Detection
When an employee submits a trade, the system checks for opposite-direction trades on the same ticker within 30 days:
- **Restricted stock** → rejected (highest priority, unchanged)
- **Short-term trade detected** → `status='pending'`, `escalated=true`, auto-approved after random 30–60 min delay via `setTimeout`
- **Normal trade** → approved immediately

Key methods:
- `TradingRequest.findRecentOppositeTradesByEmployee(email, ticker, type, days)` — query for opposite trades
- `TradingRequest.autoApprove(uuid)` — conditional update (only if still `pending`)
- `TradingRequestService._determineInitialStatus(isRestricted, ticker, instrumentType, tradingType, shortTermTrades)` — returns `{ initialStatus, rejectionReason, autoEscalate, escalationReason }`

Audit trail: `create_escalated_trading_request` → (30-60 min) → `auto_approve_escalated_request`

Error (`?error=`): `authentication_required`, `invalid_credentials`, `invalid_ticker`, `stock_already_exists`, `ticker_required`, `add_failed`, `export_failed`

---

## Environment Variables

### Required
- `SESSION_SECRET` — 32+ char random string
- `ADMIN_USERNAME` — admin login
- `ADMIN_PASSWORD_HASH` — bcrypt hash (or `ADMIN_PASSWORD` plaintext for dev)
- `DATABASE_URL` — PostgreSQL connection string

### Microsoft 365 (enables SSO, email, SharePoint)
- `AZURE_CLIENT_ID`, `AZURE_CLIENT_SECRET`, `AZURE_TENANT_ID`
- `REDIRECT_URI`, `POST_LOGOUT_REDIRECT_URI`
- `AZURE_AD_EMPLOYEE_GROUP_ID` — optional group filter

### Features
- `STATEMENT_SENDER_EMAIL` — enables statement collection
- `STATEMENT_REQUEST_SCHEDULE` — cron (default: `0 0 9 7 * *`)
- `STATEMENT_UPLOAD_DEADLINE_DAYS` — default: 14
- `BACKUP_SCHEDULE` — cron (default: `0 0 * * * *` hourly)
- `DISABLE_SCHEDULED_BACKUPS` / `DISABLE_STATEMENT_REQUESTS` — set `true` to disable
- `SHAREPOINT_SITE_URL`, `SHAREPOINT_LIBRARY_NAME` — SharePoint site and document library
- `SHAREPOINT_FOLDER_PATH` — statement upload root (employee/period subfolders created automatically)
- `SHAREPOINT_BACKUP_FOLDER_PATH` — database backup root (monthly subfolders created automatically)

### Deployment
- `NODE_ENV`, `PORT`, `LOG_LEVEL`, `FRONTEND_URL`
- `SESSION_STORE_NO_FALLBACK` — exit if DB sessions fail
- `RAILWAY_VOLUME_MOUNT_PATH` — persistent backup storage

---

## Common Patterns

### Adding a new page template
1. Create template file in `src/templates/{section}/` (e.g., `src/templates/admin/newPage.js`)
2. Export a function: `function renderNewPage(data) { return \`<html>...\`; }`
3. Import `escapeHtml` from `../../utils/formatters` and escape ALL user-provided data
4. Import template in the controller and call it: `const html = renderNewPage({ ... })`
5. Pass result to `renderAdminPage(title, html)` or `renderEmployeePage(title, html, email)`
6. Templates receive plain data objects — NEVER `req` or `res`

### Adding a new POST route
1. Add CSRF token to form: `<input type="hidden" name="csrf_token" value="${req.session.csrfToken}">`
2. Route: `app.post('/path', requireEmployee, verifyCsrfToken, Controller.method)`
3. Handler uses `catchAsync` wrapper for async error handling
4. Redirect with query param on success: `res.redirect('/page?message=success_key')`
5. Add success_key to `generateNotificationBanner` switch in templates.js

### Adding a new model
1. Extend `BaseModel` for table name and static methods
2. Use `this.query()` for SELECT, `this.get()` for single row, `this.run()` for INSERT/UPDATE/DELETE
3. If INSERT has `RETURNING *`, use `this.query()` not `this.run()` (avoids double RETURNING)
4. Add table creation to `database.js` init()
5. Add migration file in `/migrations/`
6. Add to `BackupService.createSQLBackup()`

### Error handling
```javascript
// In controllers — use catchAsync wrapper
methodName = catchAsync(async (req, res) => {
  // throws become 500 responses via globalErrorHandler
});

// In services — throw AppError for known errors
throw new AppError('User-friendly message', 400);
```

---

## Known Gotchas

1. **CSP blocks all JS** — use CSS-only solutions, no onclick/onchange
2. **database.run() appends RETURNING uuid** — don't use with queries that already have RETURNING
3. **database.init() is async but not awaited** — schema may not be ready when first requests arrive
4. **run-migrations.js** throws on non-"already exists" errors — caller must catch
5. **Functional indexes with AT TIME ZONE** are STABLE not IMMUTABLE — incompatible with TIMESTAMPTZ columns (dropped in migration 014)
6. **Session store** falls back to memory if PostgreSQL unavailable — set `SESSION_STORE_NO_FALLBACK=true` in production
7. **Railway port** — app defaults to PORT=3001, Railway sets PORT dynamically via env var
8. **SharePoint library name** — Graph API returns display name "Documents", not URL path "Shared Documents". `getSharePointDriveId()` does flexible matching (exact, case-insensitive, URL-based)
9. **requireBrokerageSetup** caches result in `req.session._brokerageCheck` for 5 min — must `delete req.session._brokerageCheck` when accounts change
10. **SharePoint site/drive IDs** are cached in static fields — persist until server restart
11. **Auto-approve setTimeout** — if server restarts, escalated trades stay `pending` and require manual admin approval
12. **Section-toggle collapsible** — use `help-toggle section-toggle` class for heading-style collapsible sections (vs small helper text style)

---

## Security: HTML Escaping

All user-controlled data must be escaped before rendering in templates:

```javascript
const { escapeHtml } = require('../../utils/formatters');

// In templates — escape all database/user values
`<td>${escapeHtml(request.stock_name)}</td>`
`<input value="${escapeHtml(editAccount.firm_name)}">`
`<span title="${escapeHtml(request.rejection_reason)}">`

// Do NOT escape:
// - Pre-rendered HTML (banner, csrfInput)
// - Output of getDisplayId(), formatHongKongTime() (safe by construction)
// - System-generated UUIDs
// - Values already URL-encoded via URLSearchParams
```

---

## Development Notes

- **Version**: 3.4.1 (February 2026)
- **Node.js**: >=20.0.0
- **Testing**: Jest 30 — 459 tests across 16 suites (`npm test`)
- **CSS**: 16 modular files in `public/css/` → minified to `styles-modern.min.css` via `npm run css:build` (cache-busted via `?v=${APP_VERSION}`)
- **Templates**: 23 template files in `src/templates/` (controllers reduced 52% from 3,691 to 1,778 lines)
- **Compliance**: Full audit trail, data export, regulatory compliance
- **Performance**: LRU caching, database indexes, circuit breakers, sargable queries, session-cached middleware, SharePoint ID caching

**Remember**: This is a compliance-focused financial application. Security and audit requirements take precedence over convenience features. No inline JavaScript. No inline styles. Always escape user data with `escapeHtml()`.
