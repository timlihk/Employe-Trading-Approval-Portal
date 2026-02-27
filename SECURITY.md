# Security Policy

## Content Security Policy (CSP)

Strict CSP enforced via Helmet:
- `script-src`: `'none'` — no JavaScript execution
- `style-src`: `'self'`, `https://fonts.googleapis.com`
- `font-src`: `'self'`, `https:`, `data:`
- `default-src`: `'self'`
- `object-src`: `'none'`
- `form-action`: `'self'`
- `frame-ancestors`: `'self'`

No inline styles or scripts allowed. All interactivity is CSS-only or server-side.

## Authentication

### Employee Authentication
- Microsoft 365 SSO via Azure AD OAuth 2.0 (optional)
- Demo mode with email-based login when SSO not configured
- Session-based with automatic expiration (24 hours)
- Mandatory brokerage account onboarding before dashboard access
- Monthly account confirmation (30-day cycle)

### Administrator Authentication
- Username/password with bcrypt password hashing
- Rate limiting: 5 attempts per 15 minutes
- `ADMIN_PASSWORD_HASH` (bcrypt) preferred over plaintext `ADMIN_PASSWORD`

## Session Management

### PostgreSQL Session Store (Production)
- `connect-pg-simple` with automatic table creation
- Retry logic: 3 attempts with exponential backoff (1s/2s/4s)
- Automatic session pruning every 15 minutes
- Recommended index: `CREATE INDEX idx_session_expire ON session(expire);`

### Cookie Security
- `Secure`: true (HTTPS only, production)
- `HttpOnly`: true (no JavaScript access)
- `SameSite`: 'lax' (CSRF protection)
- `MaxAge`: 24 hours

### Fallback Behavior
- **Default**: Falls back to memory store with `SESSION_STORE_FALLBACK_TO_MEMORY` warning
- **Strict mode**: Set `SESSION_STORE_NO_FALLBACK=true` to exit on failure

## CSRF Protection

- Tokens generated using `crypto.randomBytes(32).toString('hex')`
- Required on all POST routes via `verifyCsrfToken` middleware
- Timing-safe comparison to prevent timing attacks
- Token rotation after successful validation
- Security event logging for failed validations

## Rate Limiting

| Endpoint Type | Limit | Window |
|---------------|-------|--------|
| General | 1000 requests | 15 minutes |
| Authentication | 5 attempts | 15 minutes |
| Admin actions | 10 actions | 1 minute |

## Input Validation

- `express-validator` for form field validation
- Parameterized SQL queries throughout (no string interpolation)
- Ticker format: letters, numbers, dots, hyphens
- ISIN format: 12-character alphanumeric
- File upload: size limits and content-type validation via Multer

## Database Security

- SSL/TLS connections in production (`rejectUnauthorized: false` for Railway)
- Connection pooling with automatic cleanup
- No hardcoded credentials (environment variables only)
- UUID primary keys (non-guessable identifiers)

## Audit Logging

All user actions logged to `audit_logs` table with:
- User email and type (admin/employee)
- Action performed and target resource
- IP address and user agent
- Session ID for correlation
- Timestamp (TIMESTAMPTZ)

## Logging Security

- No sensitive data in logs (request bodies, headers, cookies redacted)
- Security events logged with structured fields
- Request ID tracking for correlation across log entries

## Required Environment Variables

| Variable | Purpose | Required |
|----------|---------|----------|
| `SESSION_SECRET` | Session signing (32+ chars) | Yes |
| `ADMIN_USERNAME` | Admin login | Yes |
| `ADMIN_PASSWORD_HASH` | Bcrypt hash of admin password | Yes (prod) |
| `DATABASE_URL` | PostgreSQL connection string | Yes |

## File Access Security

Statement files are served through an authenticated proxy (`/statement-file/:uuid`):
- Files are **never** exposed via direct SharePoint URLs
- Auth check: must be the owning employee or an admin
- Files fetched server-side via Graph API and streamed to browser
- Content-Disposition set to `inline` with original filename

## Middleware Caching

`requireBrokerageSetup` middleware caches its result in `req.session._brokerageCheck` for 5 minutes:
- Cache is invalidated when accounts are added, removed, or confirmed
- On cache miss: single combined SQL query (account count + confirmation check)
- Graceful degradation: if check fails, request proceeds (no lockout)

## Monitoring Events

Key security events to monitor in logs:

| Event | Description |
|-------|-------------|
| `CSRF_VALIDATION_FAILED` | Failed CSRF token on POST request |
| `UNAUTHORIZED_ADMIN_ACCESS` | Access attempt without admin session |
| `UNAUTHORIZED_EMPLOYEE_ACCESS` | Access attempt without employee session |
| `SESSION_STORE_FALLBACK_TO_MEMORY` | PostgreSQL session store failed |
| `SESSION_STORE_STRICT_MODE_EXIT` | App exited due to strict session mode |
| `statement_sharepoint_upload_failed` | SharePoint upload error (audit log) |

## Recommendations

### Production Deployment
1. Set `SESSION_STORE_NO_FALLBACK=true` to prevent memory store fallback
2. Use `ADMIN_PASSWORD_HASH` (bcrypt) instead of plaintext password
3. Monitor `SESSION_STORE_FALLBACK_TO_MEMORY` events for alerts
4. Create session table index: `CREATE INDEX idx_session_expire ON session(expire);`
5. Rotate `SESSION_SECRET` periodically
6. Enable HTTPS (automatic on Railway)

### Compliance
- Complete audit trail for all trading requests and admin actions
- CSV export for regulatory reporting
- IP address tracking for forensics
- Data retention: all records retained permanently
- Database backups with SharePoint off-site storage

## Vulnerability Reporting

For security issues, please contact the development team immediately through internal channels.
