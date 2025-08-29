# CLAUDE.md - Project Memory & Guidelines

## 🏗️ Project Overview

**Employee Trading Approval Portal** - A compliance-focused web application for managing employee stock/bond trading requests with automatic approval/rejection based on restricted lists.

### Key Architecture
- **Backend**: Node.js + Express.js (traditional server, NOT serverless)
- **Database**: PostgreSQL with session storage
- **Frontend**: Server-side rendering with template strings (no React/Vue)
- **Authentication**: Email-based + Microsoft 365 SSO (optional)
- **Deployment**: Railway (NOT Vercel - see deployment notes)

---

## 🔒 Critical Security Constraints

### **STRICT Content Security Policy (CSP)**
```javascript
// src/app.js lines 164-183
contentSecurityPolicy: {
  scriptSrc: ["'none'"],        // ❌ NO JavaScript allowed AT ALL
  styleSrc: ["'self'"],         // ❌ NO inline styles
  defaultSrc: ["'self'"],
  objectSrc: ["'none'"]
}
```

### **⚠️ NEVER ADD:**
- Inline JavaScript (`onclick`, `onchange`, etc.)
- External JavaScript libraries
- `javascript:` links
- `<script>` tags with code
- Inline `style` attributes

### **✅ ALLOWED APPROACHES:**
- Pure CSS solutions with `:checked`, `:hover`, etc.
- CSS-only animations and interactions
- Hidden checkboxes + labels for toggles
- Server-side form handling

---

## 🎨 UI/UX Guidelines

### Form Components
- Use collapsible help sections (CSS-only with checkboxes)
- Radio buttons need proper spacing (0.5rem margin-right)
- All validation errors redirect with user-friendly messages
- No raw JSON displayed to users

### Error Handling
- Invalid tickers show friendly messages, not "Pretty-print JSON"
- Form data preserved in query params after errors
- Validation happens in `src/middleware/validation.js`

### Current Working Solutions
```css
/* Toggle pattern - works with strict CSP */
.help-checkbox { display: none; }
.help-checkbox:checked ~ .help-content { display: block; }
.help-checkbox:checked + .help-toggle::before { transform: rotate(90deg); }
```

---

## 📁 Project Structure

```
src/
├── app.js                    # Main server file with CSP config
├── controllers/              # Route handlers
│   ├── EmployeeController.js # Dashboard, history, forms
│   ├── AdminController.js    # Admin panel, user management
│   └── TradingRequestController.js # Request processing
├── services/                 # Business logic
│   ├── TradingRequestService.js # Core trading logic
│   ├── BackupService.js      # Database backups
│   └── CurrencyService.js    # Currency conversion
├── models/                   # Database models
├── middleware/               # Security, validation, auth
│   └── validation.js         # Form validation with user-friendly errors
└── utils/                    # Helpers, templates, formatters
```

---

## 🗄️ Database Details

### Core Tables
- `trading_requests` - Main transaction records
- `restricted_stocks` - Blacklisted tickers/ISINs
- `sessions` - User session storage
- `audit_logs` - Complete activity tracking

### Important Features
- **UUID primary keys** (not auto-increment IDs)
- **Automatic approval/rejection** based on restricted list
- **Audit logging** for all actions (required for compliance)
- **Backup system** with scheduled exports

---

## 🚀 Deployment & Environment

### Railway (Current Platform)
```env
NODE_ENV=production
DATABASE_URL=postgresql://...  # Provided by Railway
SESSION_SECRET=<generate-strong-secret>
ADMIN_USERNAME=admin
ADMIN_PASSWORD_HASH=<bcrypt-hash>
# Microsoft SSO optional (can be disabled)
```

### ❌ Why NOT Vercel
- App is stateful (sessions, persistent connections)
- Long-running processes (backups, migrations)
- Traditional Express server architecture
- Would require 70% rewrite for serverless

### Testing Commands
```bash
npm start                     # Start development server
npm run lint                  # Code quality check
npm run typecheck            # Type validation
```

---

## 🧪 Common Fixes & Patterns

### Adding New Features
1. ✅ Check if CSP allows the approach
2. ✅ Use server-side rendering with templates
3. ✅ Handle validation in middleware with redirects
4. ✅ Add audit logging for admin actions
5. ✅ Test with form validation edge cases

### UI Components
```javascript
// ✅ Collapsible sections (CSS-only)
<input type="checkbox" id="help-toggle" class="help-checkbox">
<label for="help-toggle" class="help-toggle">
  <span class="show-text">Show details</span>
  <span class="hide-text">Hide details</span>
</label>
<div class="help-content">Content here</div>

// ✅ Radio buttons with proper spacing
<label class="radio-option">
  <input type="radio" name="type" value="buy">
  <span>BUY</span>
</label>
```

### Error Messages
```javascript
// ✅ In middleware/validation.js
if (req.path === '/preview-trade') {
  const errorMsg = `Invalid ticker format: "${ticker}". Please use only letters, numbers, dots, and hyphens`;
  return res.redirect(`/employee-dashboard?error=${encodeURIComponent(errorMsg)}`);
}
```

---

## 📋 Feature Status

### ✅ Completed
- Ticker validation with Yahoo Finance API
- Bond/ISIN support alongside stocks
- Automatic approval/rejection system
- Admin panel with user management
- Database backup system
- Collapsible help sections (CSS-only)
- User-friendly error messages

### 🎯 Current State
- Production-ready on Railway
- Strict security implemented
- Full audit compliance
- Clean, professional UI

---

## 🐛 Known Gotchas

1. **CSP Violations**: Any JavaScript will be blocked - use CSS solutions
2. **Form Validation**: Must redirect with errors, not return JSON
3. **Session Storage**: Uses database, not Redis (works with Railway)
4. **Backup Location**: Uses Railway volumes, not local filesystem
5. **UUID Format**: Display IDs formatted for user-friendliness

---

## 📞 When Things Go Wrong

### Common Issues
- **"Show examples" not working**: Check for CSP violations, use CSS-only
- **Pretty-print JSON errors**: Check validation middleware redirects
- **Session lost**: Verify DATABASE_URL and session configuration
- **Backup failures**: Check Railway volume permissions

### Debug Commands
```bash
# Check logs
railway logs

# Verify environment
node -e "console.log(process.env.DATABASE_URL ? 'DB OK' : 'DB MISSING')"

# Test ticker validation
node -e "require('./src/services/TradingRequestService').validateTicker('AAPL').then(console.log)"
```

---

## 📝 Development Notes

- **Version**: 2.2 (August 2025)
- **Last Major Update**: UI improvements and error handling fixes
- **Security Level**: Enterprise-grade with strict CSP
- **Compliance**: Full audit trail implemented
- **Performance**: Optimized for 1-1000 concurrent users

**Remember**: This is a compliance-focused financial application. Security and audit requirements take precedence over convenience features.