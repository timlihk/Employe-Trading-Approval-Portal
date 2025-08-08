# Security Policy

## Environment Variables

### Required Security Variables

- `SESSION_SECRET` - **REQUIRED** in production. Cryptographically secure random string for session signing.
- `ADMIN_USERNAME` - **REQUIRED** in production. Administrator login username.
- `ADMIN_PASSWORD` - **REQUIRED** in production. Administrator login password.

### Session Store Configuration

- `SESSION_STORE_NO_FALLBACK` - Optional. Set to `'true'` to disable memory store fallback in strict production environments.

## Session Management

### PostgreSQL Session Store (Production)

The application uses PostgreSQL-backed sessions in production for persistence across deployments:

- **Steady State**: PostgreSQL sessions with automatic table creation
- **Retry Logic**: 3 attempts with exponential backoff (1s/2s/4s) for database connectivity
- **Cleanup**: Automatic session pruning every 15 minutes
- **Table**: `session` table with recommended index on `expire` column

### Fallback Behavior

When PostgreSQL session store initialization fails:

1. **Default Behavior**: Falls back to memory store with loud warnings
   - Logs `SESSION_STORE_FALLBACK_TO_MEMORY` event for monitoring
   - Sessions will not persist across deployments
   - Requires immediate investigation

2. **Strict Mode**: Set `SESSION_STORE_NO_FALLBACK=true` to:
   - Exit application immediately if PostgreSQL sessions fail
   - Prevent silent degradation to memory store
   - Recommended for critical production environments

### Cookie Security

Production session cookies are configured with:
- `Secure`: true (HTTPS only)
- `HttpOnly`: true (no JavaScript access)
- `SameSite`: 'lax' (CSRF protection)
- `MaxAge`: 24 hours

## CSRF Protection

Manual CSRF token implementation:
- Tokens generated using `crypto.randomBytes(24)`
- Required for all POST requests via hidden `csrf_token` field
- Token rotation after successful validation
- Security event logging for failed validations

## Content Security Policy (CSP)

Strict CSP configuration:
- `script-src`: 'none' (no JavaScript execution)
- `style-src`: 'self' + 'unsafe-inline' (TODO: remove unsafe-inline)
- `default-src`: 'self' (same-origin only)
- Additional security headers: HSTS, referrer policy, frame guards

## Database Security

- SSL/TLS connections required in production (`rejectUnauthorized: false` for Railway)
- Connection pooling with timeouts
- No hardcoded credentials (environment variables only)
- Parameterized queries to prevent SQL injection

## Logging Security

- No sensitive data in logs (bodies, headers, cookies redacted)
- Security events logged with correlation IDs
- Request tracking without PII exposure

## Authentication

### Employee Authentication
- Microsoft 365 SSO integration (optional)
- Session-based authentication
- Unauthorized access logging

### Administrator Authentication
- Username/password authentication
- Rate limiting on auth endpoints
- Session timeout enforcement

## Monitoring Events

Key security events for monitoring:
- `CSRF_VALIDATION_FAILED` - Failed CSRF token validation
- `UNAUTHORIZED_ADMIN_ACCESS` - Unauthorized admin access attempt  
- `UNAUTHORIZED_EMPLOYEE_ACCESS` - Unauthorized employee access attempt
- `SESSION_STORE_FALLBACK_TO_MEMORY` - Critical session store fallback
- `SESSION_STORE_STRICT_MODE_EXIT` - Application exit due to strict mode

## Recommendations

### Immediate Actions
1. Set up monitoring alerts for `SESSION_STORE_FALLBACK_TO_MEMORY` events
2. Create database index: `CREATE INDEX idx_session_expire ON session(expire);`
3. Configure `SESSION_STORE_NO_FALLBACK=true` for strict production environments
4. Monitor CSRF validation failure rates

### Future Improvements
1. Remove 'unsafe-inline' from CSP style-src directive
2. Implement proper database migrations instead of boot-time DDL
3. Add automated security testing in CI/CD pipeline
4. Implement session table cleanup monitoring

## Vulnerability Reporting

For security issues, please contact the development team immediately through internal channels.

## Compliance

This application implements security controls for:
- Session management and persistence
- Cross-Site Request Forgery (CSRF) protection  
- Content Security Policy (CSP) enforcement
- Secure cookie handling
- Authentication and authorization logging