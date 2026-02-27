# Development Guide

## Overview

Development guidelines and optimization history for the Employee Trading Approval Portal.

## Code Quality Standards

### Method Design
- Methods should be <50 lines (preferably <30)
- Single responsibility per method
- Private methods prefixed with `_`
- Async/await with try-catch throughout

### Error Handling
```javascript
// Controllers: use catchAsync wrapper
methodName = catchAsync(async (req, res) => { ... });

// Services: throw AppError for known errors
throw new AppError('User-friendly message', 400);

// Unknown errors: re-throw or wrap
if (error instanceof AppError) throw error;
throw new AppError('Something went wrong', 500);
```

### Database Queries
- Always use parameterized queries (`$1`, `$2`, etc.)
- Use sargable date queries: `created_at >= ($1::date AT TIME ZONE 'Asia/Hong_Kong')` not `DATE(created_at AT TIME ZONE ...)`
- Do not wrap indexed columns in functions (no `LOWER(email)` — emails are lowered on insert)
- Use `query()` for SELECT, `get()` for single row, `run()` for INSERT/UPDATE/DELETE
- Models with `RETURNING *` in INSERT must use `query()` not `run()` (run() appends RETURNING uuid)

### CSS / UI
- No inline `style` attributes — use CSS classes
- No inline JavaScript — strict CSP blocks all JS
- Alert classes: `alert-success`, `alert-error`, `alert-info`, `alert-warning` (with `alert` base class)
- Use `renderCard()`, `renderTable()`, `generateNotificationBanner()` template helpers

### Code Review Checklist
- [ ] No inline styles or scripts (CSP compliance)
- [ ] Parameterized SQL queries (no string interpolation)
- [ ] Audit logging for admin/sensitive actions
- [ ] CSRF token in all POST forms
- [ ] Input validation via express-validator
- [ ] Error handling with catchAsync/AppError
- [ ] New tables added to database.js init() + migration file + BackupService

## Testing

```bash
npm test                    # Run all tests
npm run test:watch          # Watch mode
npm run test:coverage       # Coverage report
```

- Framework: Jest 30
- Test files: `test/unit/` and `test/integration/`
- Coverage threshold: 50% (lines, functions, branches, statements)
- Mock database in `src/models/__mocks__/database.js`

## Optimization History

### Completed

| Area | Change | Impact |
|------|--------|--------|
| Database indexes | 15+ indexes on frequently queried columns | 50-80% faster filtered queries |
| TIMESTAMPTZ | Upgraded all TIMESTAMP columns to TIMESTAMPTZ | Correct timezone handling |
| Sargable queries | Replaced `DATE(col AT TIME ZONE ...)` with range comparisons | Index-friendly date filtering |
| CSP hardening | Removed `unsafe-inline` from style-src | Eliminated XSS risk |
| CSS minification | `styles-modern.css` → `styles-modern.min.css` | 28% smaller payload |
| Cache management | LRU eviction with 1000 item limit | Prevents memory leaks |
| Method refactoring | TradingRequestService -44%, AuditLog -44% | Better testability |
| Duplicate removal | Removed duplicate `escalate()` method | Cleaner codebase |
| Application metrics | `/metrics` endpoint with DB/cache/error stats | Operational visibility |
| UI redesign | Full CSS overhaul with consolidated stylesheet | Professional, consistent UI |
| Session-cached middleware | `requireBrokerageSetup` cached 5 min, single combined query | 2 fewer DB queries per page load |
| SharePoint ID caching | Site ID and drive ID cached in memory | Eliminates Graph API calls per upload/download |
| Composite DB indexes | `(employee_email, status)`, `(period, employee)` on statement_requests | Faster filtered queries |
| SQL-side date checks | `isConfirmationCurrent()` uses SQL interval comparison | Eliminates extra row fetch + JS date math |
| File proxy endpoint | `/statement-file/:uuid` serves files via Graph API | Direct file viewing without SharePoint UI |
| 30-day short-term detection | Auto-escalate opposite-direction trades within 30 days | SFC FMCC holding period compliance |
| Delayed auto-approve | `setTimeout` 30-60 min random delay for escalated trades | Creates both escalation and approval audit records |
| Historical data migration | SharePoint Forms import with Yahoo Finance ticker resolution | 96 historical records migrated with manual mapping table |
| Retroactive flagging | `--flag-short-term` mode scans historical trades for 30-day violations | 18 historical trades flagged for compliance |
| Typography scaling | Major Third type scale (14/16/20/24/32px) with mobile responsive overrides | Industry-standard readability, proper mobile sizing |
| Compact filter grid | `grid-filters` with `repeat(6, 1fr)` + `width: 100%` inputs | All 6 history filters in single horizontal row |
| Announcement emails | One-time script to email all employees via Graph API | Onboarding communication with dry-run support |
| Dynamic CSS cache bust | `?v=${APP_VERSION}` from package.json on all CSS links | No more stale stylesheets after deploys |
| Dead code removal | Deleted `app-backup.js` (2,945 lines) | Cleaner codebase |

### Architecture Decisions

| Decision | Rationale |
|----------|-----------|
| Railway, not Vercel | Stateful server with sessions, scheduled tasks, persistent DB connections |
| No client-side JS | Strict CSP (`script-src: 'none'`) for maximum security |
| PostgreSQL, not SQLite | Production-grade, Railway-managed, concurrent connections |
| UUID primary keys | Non-guessable, merge-safe, no sequential enumeration |
| Server-side rendering | CSP compliance, no build step, works everywhere |
| Lazy profile creation | Employee profiles created on first confirmation, no bulk migration needed |
| Employee-first SharePoint folders | `{employee}/{period}/` — easy per-person auditing and offboarding |
| File proxy over direct URLs | `/statement-file/:uuid` — auth-checked, no SharePoint login needed for viewing |
| setTimeout over job queue | 30-60 min auto-approve delay — short enough for in-memory timer, trade stays `pending` if server restarts |
| Yahoo Finance for ticker resolution | Migration script resolves company names → tickers via search API + manual mapping fallback |
| Compact filter grid | `grid-filters` with `repeat(6, 1fr)` — fits 6 filters in one row without horizontal scroll |
| Dynamic CSS versioning | `?v=${APP_VERSION}` auto-busts browser cache on every version bump — no manual cache buster updates |
| Major Third type scale | 14/16/20/24/32px desktop, 14/16/18/20/24px mobile — matches Apple/Material/GitHub standards |

## Project Structure

See [CLAUDE.md](./CLAUDE.md) for full project structure and architecture details.

## Related Documentation

- [README.md](./README.md) — Project overview, features, API endpoints
- [CLAUDE.md](./CLAUDE.md) — Architecture guidelines and patterns
- [SECURITY.md](./SECURITY.md) — Security policies
- [DEPLOYMENT.md](./DEPLOYMENT.md) — Railway deployment guide
- [SECURITY_SETUP.md](./SECURITY_SETUP.md) — Environment variable setup
- [RAILWAY_VOLUME_SETUP.md](./RAILWAY_VOLUME_SETUP.md) — Persistent volume setup

---

*Last Updated: February 2026 — Version 3.3.1*
