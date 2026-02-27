// Employee dashboard template — trading form + statement card
const { escapeHtml } = require('../../utils/formatters');

/**
 * @param {object} data
 * @param {string} data.banner           - pre-rendered notification banner HTML
 * @param {string} data.csrfInput        - hidden CSRF input HTML
 * @param {string} data.prefilledTicker
 * @param {string} data.prefilledShares
 * @param {string} data.prefilledType    - 'buy' or 'sell'
 * @param {Array}  data.brokerageAccounts
 * @param {Array}  data.pendingStatements
 * @param {Array}  data.uploadedStatements
 * @returns {string} HTML
 */
function renderDashboard(data) {
  const {
    banner,
    csrfInput,
    prefilledTicker,
    prefilledShares,
    prefilledType,
    brokerageAccounts,
    pendingStatements,
    uploadedStatements,
  } = data;

  // Build pending statement rows
  const pendingRows = pendingStatements.map(r => {
    const monthName = new Date(r.period_year, r.period_month - 1).toLocaleString('en-US', { month: 'long' });
    const deadlineStr = r.deadline_at
      ? new Date(r.deadline_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })
      : 'N/A';
    const isOverdue = r.status === 'overdue' || (r.deadline_at && new Date(r.deadline_at) < new Date());
    return `<tr>
      <td><span class="font-weight-600">${monthName} ${r.period_year}</span></td>
      <td class="text-sm">${escapeHtml(r.brokerage_name) || '-'}</td>
      <td>${deadlineStr}${isOverdue ? ' <span class="table-status overdue">Overdue</span>' : ''}</td>
      <td><a href="${r.upload_token ? '/upload-statement/' + r.upload_token : '/employee-upload-statement'}" class="btn btn-sm btn-primary">Upload</a></td>
    </tr>`;
  }).join('');

  // Build uploaded statement rows
  const uploadedRows = uploadedStatements.map(r => {
    const monthName = new Date(r.period_year, r.period_month - 1).toLocaleString('en-US', { month: 'long' });
    const uploadedDate = r.uploaded_at
      ? new Date(r.uploaded_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
      : '-';
    const fileInfo = escapeHtml(r.original_filename) || '-';
    const fileLink = r.sharepoint_item_id
      ? `<a href="/statement-file/${r.uuid}" target="_blank" rel="noopener">${fileInfo}</a>`
      : fileInfo;
    return `<tr>
      <td><span class="font-weight-600">${monthName} ${r.period_year}</span></td>
      <td class="text-sm">${escapeHtml(r.brokerage_name) || '-'}</td>
      <td class="text-sm">${fileLink}</td>
      <td class="table-date">${uploadedDate}</td>
      <td><span class="table-status uploaded">Uploaded</span></td>
    </tr>`;
  }).join('');

  // Build brokerage accounts list
  const accountRows = brokerageAccounts.map(a =>
    `<tr>
      <td class="font-weight-600">${escapeHtml(a.firm_name)}</td>
      <td class="text-sm">${escapeHtml(a.account_number)}</td>
      <td><a href="/employee-upload-statement?account=${a.uuid}" class="btn btn-sm btn-primary">Upload</a></td>
    </tr>`
  ).join('');

  // Statement card content
  let statementCardContent = '';

  // Brokerage accounts section
  if (brokerageAccounts.length > 0) {
    statementCardContent += `
      <h4 class="mb-3">Your Brokerage Accounts</h4>
      <div class="table-container">
        <table class="modern-table">
          <thead><tr><th>Firm</th><th>Account #</th><th>Action</th></tr></thead>
          <tbody>${accountRows}</tbody>
        </table>
      </div>`;
  } else {
    statementCardContent += `
      <p class="text-muted mb-3">No brokerage accounts registered. Please add your accounts to start uploading statements.</p>`;
  }

  // Pending uploads from admin emails
  if (pendingStatements.length > 0) {
    statementCardContent += `
      <hr class="my-4">
      <h4 class="mb-3">Pending Requests</h4>
      <div class="table-container">
        <table class="modern-table">
          <thead><tr><th>Period</th><th>Brokerage</th><th>Deadline</th><th>Action</th></tr></thead>
          <tbody>${pendingRows}</tbody>
        </table>
      </div>`;
  }

  // Recent uploads (collapsible)
  if (uploadedStatements.length > 0) {
    statementCardContent += `
      <hr class="my-4">
      <div class="collapsible-help">
        <input type="checkbox" id="recent-uploads-toggle" class="help-checkbox">
        <label for="recent-uploads-toggle" class="help-toggle section-toggle">
          <span class="toggle-text-show">Recent Uploads (${uploadedStatements.length})</span>
          <span class="toggle-text-hide">Recent Uploads (${uploadedStatements.length})</span>
        </label>
        <div class="help-content">
          <div class="table-container">
            <table class="modern-table">
              <thead><tr><th>Period</th><th>Brokerage</th><th>File</th><th>Uploaded</th><th>Status</th></tr></thead>
              <tbody>${uploadedRows}</tbody>
            </table>
          </div>
        </div>
      </div>`;
  }

  const statementCard = `
    <div class="card mt-6">
      <div class="card-header">
        <h3 class="card-title">Monthly Trading Statements</h3>
      </div>
      <div class="card-body">
        <div class="mb-4">
          <a href="/employee-brokerage-accounts" class="btn btn-secondary">Manage Accounts</a>
        </div>
        ${statementCardContent}
      </div>
    </div>`;

  return `
    ${banner}
    <div class="card">
      <div class="card-header">
        <h3 class="card-title">Submit Trading Request</h3>
      </div>
      <div class="card-body p-6">
        <form method="post" action="/preview-trade" id="tradingForm">
          ${csrfInput}
          <div class="grid grid-auto gap-4 grid-mobile-stack">
            <div>
              <label class="form-label">Stock Ticker or Bond ISIN</label>
              <input type="text" name="ticker" value="${prefilledTicker}" required
                     placeholder="e.g., AAPL, MSFT or US1234567890"
                     class="form-control text-uppercase"
                     maxlength="20" pattern="[A-Za-z0-9.-]+">
              <div class="collapsible-help">
                <input type="checkbox" id="ticker-help-toggle" class="help-checkbox">
                <label for="ticker-help-toggle" class="help-toggle">
                  <span class="toggle-text-show">Show examples</span>
                  <span class="toggle-text-hide">Hide examples</span>
                </label>
                <div class="help-content">
                  <strong>US Stocks:</strong> AAPL, MSFT, GOOGL, TSLA, NVDA, AMZN<br>
                  <strong>Bond ISINs:</strong> US1234567890, GB0987654321, DE0123456789<br>
                  <strong>Hong Kong:</strong> 0700.HK, 9988.HK, 2318.HK<br>
                  <strong>UK:</strong> BARC.L, LLOY.L, VOD.L<br>
                  <strong>Europe:</strong> ASML.AS, SAP.DE, NESN.SW
                </div>
              </div>
            </div>

            <div>
              <label class="form-label">Number of Shares/Units</label>
              <input type="number" name="shares" value="${prefilledShares}" required min="1" max="1000000"
                     class="form-control">
              <div class="collapsible-help">
                <input type="checkbox" id="shares-help-toggle" class="help-checkbox">
                <label for="shares-help-toggle" class="help-toggle">
                  <span class="toggle-text-show">Show details</span>
                  <span class="toggle-text-hide">Hide details</span>
                </label>
                <div class="help-content">
                  <strong>For Stocks:</strong> Enter the number of shares (1 - 1,000,000)<br>
                  <strong>For Bonds:</strong> Enter the face value in USD (e.g., 10000 for $10,000 face value). The system assumes USD currency for bonds.
                </div>
              </div>
            </div>

            <div>
              <label class="form-label">Trading Type</label>
              <div class="d-flex gap-6">
                <label class="radio-option">
                  <input type="radio" name="trading_type" value="buy" ${prefilledType === 'buy' ? 'checked' : ''}>
                  <span class="text-success font-weight-600">BUY</span>
                </label>
                <label class="radio-option ml-4">
                  <input type="radio" name="trading_type" value="sell" ${prefilledType === 'sell' ? 'checked' : ''}>
                  <span class="text-danger font-weight-600">SELL</span>
                </label>
              </div>
            </div>
          </div>

          <div class="mt-6 text-center">
            <button type="submit" class="btn btn-primary w-full-mobile">
              Preview Trading Request
            </button>
          </div>
        </form>
      </div>
    </div>
    ${statementCard}
  `;
}

module.exports = { renderDashboard };
