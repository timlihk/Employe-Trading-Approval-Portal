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

    // Employee Guides
    const employeeContent = `
      ${collapsible('emp-trade', 'Submitting a Trading Request', `
        <ol>
          <li><strong>Navigate to Dashboard</strong> &mdash; After logging in, you will land on the Employee Dashboard.</li>
          <li><strong>Enter the ticker symbol</strong> &mdash; Type the stock ticker (e.g. AAPL, MSFT) or ISIN for bonds into the Ticker/ISIN field. Use the "Show examples" toggle for format guidance.</li>
          <li><strong>Enter the number of shares</strong> &mdash; Specify how many shares or units you intend to trade.</li>
          <li><strong>Select trade type</strong> &mdash; Choose BUY or SELL.</li>
          <li><strong>Select your brokerage account</strong> &mdash; Pick the account where the trade will be executed.</li>
          <li><strong>Click "Submit Trading Request"</strong> &mdash; This takes you to the Preview page.</li>
          <li><strong>Review the preview</strong> &mdash; Verify all details are correct. Read and accept the compliance declaration.</li>
          <li><strong>Submit for approval</strong> &mdash; Your request will be automatically checked against the restricted stocks list.</li>
        </ol>
      `)}

      ${collapsible('emp-result', 'Understanding Your Trading Result', `
        <p>After submitting, your request receives one of three statuses:</p>
        <ul>
          <li><strong>Approved</strong> &mdash; The stock is not on the restricted list. You may proceed with your trade within the approval validity period.</li>
          <li><strong>Rejected</strong> &mdash; The stock is on the restricted list. You may not execute this trade. If you believe this is an error, you can escalate the request.</li>
          <li><strong>Escalated</strong> &mdash; Your rejected request has been sent to an administrator for manual review. You will be notified of the outcome.</li>
        </ul>
      `)}

      ${collapsible('emp-history', 'Viewing Your Trading History', `
        <p>Navigate to <strong>My History</strong> from the top navigation bar to see all your past trading requests.</p>
        <ul>
          <li><strong>Filter by status</strong> &mdash; Use the status filter to show only approved, rejected, or escalated requests.</li>
          <li><strong>Search</strong> &mdash; Search by ticker symbol to find specific requests.</li>
          <li><strong>Export to CSV</strong> &mdash; Click the Export button to download your trading history as a spreadsheet.</li>
        </ul>
      `)}

      ${collapsible('emp-brokerage', 'Managing Brokerage Accounts', `
        <p>Before submitting your first trading request, you must set up your brokerage accounts.</p>
        <ol>
          <li><strong>Navigate to Accounts</strong> &mdash; Click "Accounts" in the top navigation bar.</li>
          <li><strong>Add your accounts</strong> &mdash; Enter the brokerage name and account number for each account you use.</li>
          <li><strong>Confirm your accounts</strong> &mdash; Once all accounts are added, click "Confirm Accounts" to finalize your setup.</li>
        </ol>
        <p>You can edit or remove accounts at any time before confirming. After confirmation, contact your administrator to make changes.</p>
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

    // Admin Guides
    const adminContent = `
      ${collapsible('adm-dashboard', 'Dashboard Overview', `
        <p>The admin dashboard shows key metrics at a glance:</p>
        <ul>
          <li><strong>Pending Requests</strong> &mdash; Number of trading requests awaiting review (escalated requests).</li>
          <li><strong>Escalated</strong> &mdash; Requests that employees have escalated for manual review.</li>
          <li><strong>Submitted Today</strong> &mdash; Total requests received today.</li>
          <li><strong>Restricted Stocks</strong> &mdash; Number of stocks currently on the restricted list.</li>
        </ul>
        <p>Below the metrics, use the Quick Actions list to navigate to common tasks.</p>
      `)}

      ${collapsible('adm-restricted', 'Managing Restricted Stocks', `
        <p>The restricted stocks list determines which trades are automatically rejected.</p>
        <ul>
          <li><strong>Add a stock</strong> &mdash; Enter a ticker symbol (e.g. AAPL) or ISIN. The system validates the ticker against market data before adding.</li>
          <li><strong>Remove a stock</strong> &mdash; Click Remove next to any stock in the list. This takes effect immediately for future requests.</li>
        </ul>
        <p>All changes to the restricted list are recorded in the audit log.</p>
      `)}

      ${collapsible('adm-requests', 'Reviewing Trading Requests', `
        <p>Navigate to <strong>Trading Requests</strong> to see all submitted requests.</p>
        <ul>
          <li><strong>Filter by escalated</strong> &mdash; Use the filter to show only escalated requests that need manual review.</li>
          <li><strong>Approve</strong> &mdash; Click Approve to grant the employee permission to trade.</li>
          <li><strong>Reject</strong> &mdash; Click Reject, provide a reason, and the employee will be notified.</li>
          <li><strong>Export</strong> &mdash; Download all trading requests as a CSV file for compliance records.</li>
        </ul>
      `)}

      ${collapsible('adm-statements', 'Statement Management', `
        <p>Navigate to <strong>Statements</strong> to manage the monthly statement request process.</p>
        <ul>
          <li><strong>Send monthly requests</strong> &mdash; Trigger statement request emails to all employees. This can also be automated via the scheduler.</li>
          <li><strong>Track compliance</strong> &mdash; View which employees have submitted their statements and which are overdue.</li>
          <li><strong>Resend emails</strong> &mdash; Resend the upload link to individual employees who may have missed it.</li>
          <li><strong>Scheduler</strong> &mdash; View and manage the automatic statement request schedule.</li>
        </ul>
      `)}

      ${collapsible('adm-backup', 'Database and Backup Operations', `
        <ul>
          <li><strong>Export data</strong> &mdash; Download trading requests or audit logs as CSV files.</li>
          <li><strong>Database backup</strong> &mdash; Create JSON or SQL backups of the entire database. Backups can be stored on the server or downloaded.</li>
          <li><strong>Backup scheduler</strong> &mdash; View the automated backup schedule and trigger manual backups.</li>
          <li><strong>Clear database</strong> &mdash; Reset all data (requires confirmation). Use only in development or when starting fresh.</li>
        </ul>
      `)}`;

    // FAQ
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
