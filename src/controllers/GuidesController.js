const { renderEmployeePage, renderAdminPage, renderPublicPage, renderCard } = require('../utils/templates');

function collapsible(id, title, contentHtml) {
  return `
    <div class="collapsible-help">
      <input type="checkbox" id="guide-${id}" class="help-checkbox">
      <label for="guide-${id}" class="help-toggle">
        <span class="toggle-text-show">Show</span>
        <span class="toggle-text-hide">Hide</span>
        ${title}
      </label>
      <div class="help-content">
        ${contentHtml}
      </div>
    </div>`;
}

class GuidesController {
  getGuides = (req, res) => {
    const title = 'Guides';

    // Table of Contents
    const tocContent = `
      <ul class="action-list">
        <li><a href="#employee-guides" class="action-item"><span>Employee Workflows</span><span class="action-arrow" aria-hidden="true">&#8250;</span></a></li>
        <li><a href="#admin-guides" class="action-item"><span>Administrator Workflows</span><span class="action-arrow" aria-hidden="true">&#8250;</span></a></li>
        <li><a href="#faq" class="action-item"><span>Frequently Asked Questions</span><span class="action-arrow" aria-hidden="true">&#8250;</span></a></li>
      </ul>`;

    // ── Employee Guides ──
    const employeeContent = `
      ${collapsible('emp-trade', 'Submitting a Trading Request', `
        <img src="/images/guides/employee-dashboard.png" alt="Employee Dashboard — Submit Trading Request form" class="guide-screenshot">
        <ol>
          <li><strong>Enter the ticker symbol</strong> &mdash; Type the stock ticker (e.g. AAPL, MSFT) or ISIN for bonds into the Ticker/ISIN field.</li>
          <li><strong>Enter the number of shares</strong> &mdash; Specify how many shares or units you intend to trade.</li>
          <li><strong>Select trade type</strong> &mdash; Choose BUY or SELL.</li>
          <li><strong>Click "Preview Trading Request"</strong> &mdash; Review the details and accept the compliance declaration before final submission.</li>
        </ol>
      `)}

      ${collapsible('emp-result', 'Understanding Your Trading Result', `
        <img src="/images/guides/trade-result-approved.png" alt="Trading Result — Approved status page" class="guide-screenshot">
        <p>After submitting, the result page shows:</p>
        <ol>
          <li><strong>Status banner</strong> &mdash; Green for Approved, red for Rejected. This tells you the outcome at a glance.</li>
          <li><strong>Trade details</strong> &mdash; Full details of your request including stock, action, shares, and estimated total.</li>
          <li><strong>Next steps</strong> &mdash; Links to return to the dashboard or view your full request history.</li>
        </ol>
        <p>If rejected, you may escalate the request for manual review by an administrator.</p>
      `)}

      ${collapsible('emp-history', 'Viewing Your Trading History', `
        <img src="/images/guides/employee-history.png" alt="Trading History — filters, table, and export" class="guide-screenshot">
        <p>Navigate to <strong>My History</strong> from the top navigation bar.</p>
        <ol>
          <li><strong>Filter controls</strong> &mdash; Filter by date range, ticker, trade type, status, or instrument. Click "Apply Filters" to narrow results.</li>
          <li><strong>History table</strong> &mdash; Shows all your requests with date, ticker, type, shares, value, and current status.</li>
          <li><strong>Export to CSV</strong> &mdash; Click "Export History (CSV)" to download your trading history as a spreadsheet.</li>
        </ol>
      `)}

      ${collapsible('emp-brokerage', 'Managing Brokerage Accounts', `
        <img src="/images/guides/brokerage-accounts.png" alt="Brokerage Accounts — add, edit, and confirm accounts" class="guide-screenshot">
        <p>Before submitting your first trading request, you must set up your brokerage accounts.</p>
        <ol>
          <li><strong>Navigate to Accounts</strong> &mdash; Click "Accounts" in the top navigation bar.</li>
          <li><strong>Enter the firm name</strong> &mdash; Type the name of your brokerage firm (e.g. Interactive Brokers, Charles Schwab).</li>
          <li><strong>Enter the account number</strong> &mdash; Type your brokerage account number, then click "Add Account".</li>
        </ol>
        <p>Once all accounts are added, click "Confirm Accounts" to finalize your setup. You can edit or remove accounts before confirming.</p>
      `)}

      ${collapsible('emp-statement', 'Uploading Monthly Statements', `
        <p>Compliance requires monthly trading statements from your brokerage accounts.</p>
        <ul>
          <li><strong>Via email</strong> &mdash; You will receive a monthly email with a secure upload link. Click the link and upload your statement file.</li>
          <li><strong>Via dashboard</strong> &mdash; Navigate to the statement upload page from your dashboard to upload directly.</li>
          <li><strong>Accepted formats</strong> &mdash; PDF files up to 10MB per statement.</li>
        </ul>
      `)}

      ${collapsible('emp-escalate', 'Escalating a Rejected Request', `
        <p>If your trading request was rejected but you believe the restriction does not apply:</p>
        <ol>
          <li>Go to <strong>My History</strong> and find the rejected request.</li>
          <li>Click the <strong>Escalate</strong> link next to the request.</li>
          <li>Provide a reason for the escalation explaining why you believe the trade should be allowed.</li>
          <li>Submit the escalation. An administrator will review and respond.</li>
        </ol>
      `)}`;

    // ── Admin Guides ──
    const adminContent = `
      ${collapsible('adm-dashboard', 'Dashboard Overview', `
        <img src="/images/guides/admin-dashboard.png" alt="Admin Dashboard — metric cards and quick actions" class="guide-screenshot">
        <p>The admin dashboard shows key metrics at a glance:</p>
        <ol>
          <li><strong>Pending Requests</strong> &mdash; Number of trading requests awaiting review.</li>
          <li><strong>Escalated</strong> &mdash; Requests that employees have escalated for manual review.</li>
          <li><strong>Submitted Today</strong> &mdash; Total requests received today.</li>
          <li><strong>Restricted Stocks</strong> &mdash; Number of stocks currently on the restricted list.</li>
          <li><strong>Quick Actions</strong> &mdash; Shortcuts to common tasks like reviewing requests, managing stocks, and viewing logs.</li>
        </ol>
      `)}

      ${collapsible('adm-restricted', 'Managing Restricted Stocks', `
        <img src="/images/guides/admin-restricted-stocks.png" alt="Restricted Stocks — add and remove restricted tickers" class="guide-screenshot">
        <p>The restricted stocks list determines which trades are automatically rejected.</p>
        <ol>
          <li><strong>Add a stock</strong> &mdash; Enter a ticker symbol (e.g. AAPL) or ISIN into the input field and click "Add". The system validates the ticker against market data before adding.</li>
          <li><strong>Restricted list</strong> &mdash; View all currently restricted instruments. Click "Remove" next to any stock to remove it. Changes take effect immediately.</li>
        </ol>
        <p>All changes to the restricted list are recorded in the audit log.</p>
      `)}

      ${collapsible('adm-requests', 'Reviewing Trading Requests', `
        <img src="/images/guides/admin-requests.png" alt="Trading Requests — review, approve, and reject" class="guide-screenshot">
        <p>Navigate to <strong>Trading Requests</strong> to see all submitted requests.</p>
        <ol>
          <li><strong>Filter controls</strong> &mdash; Filter by employee, date range, ticker, status, or escalation state.</li>
          <li><strong>Request table</strong> &mdash; View all requests with employee details, ticker, type, shares, and value. Approve or reject directly from the table.</li>
          <li><strong>Export CSV</strong> &mdash; Download all trading requests as a CSV file for compliance records.</li>
        </ol>
      `)}

      ${collapsible('adm-statements', 'Statement Management', `
        <img src="/images/guides/admin-statements.png" alt="Statement Management — send requests and track compliance" class="guide-screenshot">
        <p>Navigate to <strong>Statements</strong> to manage the monthly statement request process.</p>
        <ol>
          <li><strong>Send Monthly Emails</strong> &mdash; Trigger statement request emails to all employees at once.</li>
          <li><strong>Scheduler Settings</strong> &mdash; View and manage the automatic statement request schedule.</li>
          <li><strong>Period selector</strong> &mdash; Choose which month to view. The stats cards show totals, emails sent, uploaded, pending, and overdue.</li>
          <li><strong>Compliance table</strong> &mdash; Track which employees have submitted their statements and which are overdue. Resend emails to individual employees.</li>
        </ol>
      `)}

      ${collapsible('adm-backup', 'Database and Backup Operations', `
        <ul>
          <li><strong>Export data</strong> &mdash; Download trading requests or audit logs as CSV files.</li>
          <li><strong>Database backup</strong> &mdash; Create JSON or SQL backups of the entire database. Backups can be stored on the server or downloaded.</li>
          <li><strong>Backup scheduler</strong> &mdash; View the automated backup schedule and trigger manual backups.</li>
          <li><strong>Clear database</strong> &mdash; Reset all data (requires confirmation). Use only in development or when starting fresh.</li>
        </ul>
      `)}`;

    // ── FAQ ──
    const faqContent = `
      ${collapsible('faq-restricted', 'What happens if my stock is on the restricted list?', `
        <p>Your trading request will be automatically rejected. You will see the rejection reason on the result page. If you believe the restriction does not apply to your situation, you can escalate the request for manual review by an administrator.</p>
      `)}

      ${collapsible('faq-validity', 'How long is a trading approval valid?', `
        <p>Trading approvals are valid for the period specified by your compliance team. Check the approval details on your result page for the exact validity window. You should execute your trade within this period.</p>
      `)}

      ${collapsible('faq-edit', 'Can I edit a submitted request?', `
        <p>No. Once a trading request is submitted, it cannot be modified. If you need to change the details, submit a new request with the correct information. The previous request will remain in your history for audit purposes.</p>
      `)}

      ${collapsible('faq-privacy', 'Who sees my trading requests?', `
        <p>Your trading requests are visible to you and to compliance administrators. Administrators can see all employee requests as part of their oversight responsibilities. All access is logged in the audit trail.</p>
      `)}`;

    // Assemble page
    const content = `
      ${renderCard('User Guide', tocContent, 'Quick navigation to guide sections')}

      <div id="employee-guides">
        ${renderCard('Employee Workflows', employeeContent, 'Step-by-step guides for employees')}
      </div>

      <div id="admin-guides">
        ${renderCard('Administrator Workflows', adminContent, 'Guides for compliance administrators')}
      </div>

      <div id="faq">
        ${renderCard('Frequently Asked Questions', faqContent)}
      </div>`;

    // Render with appropriate layout based on session
    if (req.session && req.session.admin) {
      return res.send(renderAdminPage(title, content));
    }
    if (req.session && req.session.employee) {
      return res.send(renderEmployeePage(title, content, req.session.employee.name, req.session.employee.email));
    }
    return res.send(renderPublicPage(title, content));
  };
}

module.exports = new GuidesController();
