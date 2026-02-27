// Template: Statement admin dashboard page
// Receives a plain data object, returns an HTML string

const { generateNotificationBanner, renderCard, renderTable } = require('../../utils/templates');
const { escapeHtml } = require('../../utils/formatters');

/**
 * @param {object} data
 * @param {string} data.banner - pre-rendered notification banner HTML
 * @param {number} data.year
 * @param {number} data.month
 * @param {string} data.monthName
 * @param {string[]} data.periodOptions - pre-rendered <option> HTML strings
 * @param {object} data.summary - { total, uploaded, pending, overdue, emails_sent }
 * @param {object[]} data.requests - array of statement request records
 * @param {string} data.csrfInput - pre-rendered CSRF hidden input HTML
 * @returns {string} HTML string
 */
function renderAdminDashboard(data) {
  const {
    banner,
    year,
    month,
    monthName,
    periodOptions,
    summary,
    requests,
    csrfInput,
  } = data;

  // Summary stats
  const total = summary?.total || 0;
  const uploaded = summary?.uploaded || 0;
  const pending = summary?.pending || 0;
  const overdue = summary?.overdue || 0;
  const emailsSent = summary?.emails_sent || 0;

  const summaryCard = renderCard(`${monthName} ${year}`, `
      <div class="stats-grid">
        <div class="stat-item">
          <div class="stat-value">${total}</div>
          <div class="stat-label">Total</div>
        </div>
        <div class="stat-item">
          <div class="stat-value stat-info">${emailsSent}</div>
          <div class="stat-label">Emails Sent</div>
        </div>
        <div class="stat-item">
          <div class="stat-value stat-success">${uploaded}</div>
          <div class="stat-label">Uploaded</div>
        </div>
        <div class="stat-item">
          <div class="stat-value stat-warning">${pending}</div>
          <div class="stat-label">Pending</div>
        </div>
        <div class="stat-item">
          <div class="stat-value stat-danger">${overdue}</div>
          <div class="stat-label">Overdue</div>
        </div>
      </div>
    `);

  // Requests table
  const tableHeaders = ['Employee', 'Brokerage', 'Status', 'Email Sent', 'Uploaded', 'File', 'Actions'];
  const tableRows = (requests || []).map(r => {
    const emailSentDate = r.email_sent_at
      ? new Date(r.email_sent_at).toLocaleDateString('en-GB')
      : '-';
    const uploadedDate = r.uploaded_at
      ? new Date(r.uploaded_at).toLocaleDateString('en-GB')
      : '-';
    const fileInfo = r.original_filename ? escapeHtml(r.original_filename) : '-';
    const fileLink = r.sharepoint_item_id
      ? `<a href="/statement-file/${r.uuid}" target="_blank" rel="noopener">${fileInfo}</a>`
      : fileInfo;

    const resendForm = r.status !== 'uploaded'
      ? `<form method="post" action="/admin-resend-statement-email" class="d-inline">
             ${csrfInput}
             <input type="hidden" name="statement_request_uuid" value="${r.uuid}">
             <button type="submit" class="btn btn-sm btn-secondary">Resend</button>
           </form>`
      : '';

    return `<tr>
        <td>
          <span class="font-weight-600">${escapeHtml(r.employee_name || r.employee_email)}</span><br>
          <span class="text-muted text-sm">${escapeHtml(r.employee_email)}</span>
        </td>
        <td class="text-sm">${r.brokerage_name ? escapeHtml(r.brokerage_name) : '-'}</td>
        <td><span class="table-status ${r.status}">${r.status.toUpperCase()}</span></td>
        <td class="table-date">${emailSentDate}</td>
        <td class="table-date">${uploadedDate}</td>
        <td class="text-sm">${fileLink}</td>
        <td>${resendForm}</td>
      </tr>`;
  });

  const table = renderTable(tableHeaders, tableRows, 'No statement requests for this period. Use the button above to send requests.');

  return `
        ${banner}
        <div class="action-bar">
          <form method="post" action="/admin-trigger-statement-request">
            ${csrfInput}
            <button type="submit" class="btn btn-primary">Send Monthly Emails Now</button>
          </form>
          <a href="/admin-statement-scheduler" class="btn btn-secondary">Scheduler Settings</a>
        </div>

        <form method="get" action="/admin-statements" class="period-selector">
          <label class="form-label">Period:</label>
          <select name="period" class="form-control">
            ${periodOptions.join('')}
          </select>
          <input type="hidden" name="year" value="${year}">
          <input type="hidden" name="month" value="${month}">
          <button type="submit" class="btn btn-secondary">Go</button>
        </form>

        ${summaryCard}
        ${table}`;
}

module.exports = renderAdminDashboard;
