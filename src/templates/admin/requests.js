const { formatHongKongTime } = require('../shared/formatters');
const { generateSortingControls } = require('../shared/sorting');
const { getDisplayId, escapeHtml } = require('../../utils/formatters');

/**
 * Render admin trading requests page
 * @param {Object} data
 * @param {string} data.banner - notification banner HTML
 * @param {Array} data.allRequests - array of request objects
 * @param {Object} data.pagination - pagination info { page, pages, total }
 * @param {Object} data.filters - current filter values
 * @param {string} data.csrfInput - CSRF hidden input tag
 * @param {string} data.currentSortBy
 * @param {string} data.currentSortOrder
 * @param {Object} data.queryParams - current query parameters for sort/pagination links
 * @returns {string} HTML content
 */
function requestsTemplate({
  banner,
  allRequests,
  pagination,
  filters,
  csrfInput,
  currentSortBy,
  currentSortOrder,
  queryParams
}) {
  const { employee_email, start_date, end_date, ticker, trading_type, status, escalated, instrument_type } = filters;

  // Build table rows for all requests
  const tableRows = allRequests.map(request => {
    const rowClass = request.escalated ? 'class="bg-warning"' : '';

    let actionCell = '';
    if (request.status === 'pending') {
      actionCell = `
          <form method="post" action="/admin-approve-request" class="d-inline mr-2">
            ${csrfInput}
            <input type="hidden" name="requestId" value="${request.uuid}">
            <button type="submit" class="btn btn-success btn-sm">
              ✓ Approve
            </button>
          </form>
          <a href="/admin-reject-form/${request.uuid}" class="btn btn-danger btn-sm text-decoration-none">
            ✗ Reject
          </a>
        `;
    } else if (request.escalated) {
      actionCell = `
          <strong class="text-warning">ESCALATED</strong><br>
          <small class="text-warning">${escapeHtml(request.escalation_reason) || 'N/A'}</small>
        `;
    } else {
      // No further actions available - show dash instead of duplicating status
      actionCell = '<span class="text-muted">–</span>';
    }

    return `
        <tr ${rowClass}>
          <td class="text-center">${getDisplayId(request)}</td>
          <td class="text-center">${formatHongKongTime(new Date(request.created_at))}</td>
          <td>${escapeHtml(request.employee_email)}</td>
          <td>${escapeHtml(request.stock_name) || 'N/A'}</td>
          <td class="text-center font-weight-600">${escapeHtml(request.ticker)}</td>
          <td class="text-center">
            <span class="badge ${request.instrument_type === 'bond' ? 'badge-info' : 'badge-secondary'}">
              ${request.instrument_type === 'bond' ? 'Bond' : 'Equity'}
            </span>
          </td>
          <td class="text-center">${request.trading_type.toUpperCase()}</td>
          <td class="text-center">${parseInt(request.shares).toLocaleString()}</td>
          <td class="text-right">
            $${parseFloat(request.total_value_usd || request.total_value || 0).toLocaleString('en-US', {minimumFractionDigits: 2})}
          </td>
          <td class="text-center">
            <span class="status-dot ${request.status === 'approved' ? 'status-dot-success' : request.status === 'rejected' ? 'status-dot-danger' : 'status-dot-warning'}"></span>
            <span class="badge ${request.status === 'approved' ? 'badge-success' : request.status === 'rejected' ? 'badge-danger' : 'badge-warning'}">
              ${request.status.toUpperCase()}
            </span>
          </td>
          <td class="text-center">
            ${actionCell}
          </td>
        </tr>
      `;
  }).join('');

  // Generate pagination links
  const paginationPrevParams = new URLSearchParams({...queryParams, page: (pagination?.page || 1) - 1}).toString();
  const paginationNextParams = new URLSearchParams({...queryParams, page: (pagination?.page || 1) + 1}).toString();

  return `
      ${banner}

      <!-- Filters Card -->
      <div class="card mb-6">
        <div class="card-header">
          <h3 class="card-title">Filter Trading Requests</h3>
        </div>
        <div class="card-body p-6">
          <form method="get" action="/admin-requests">
            <div class="grid grid-auto gap-4 grid-mobile-stack">
              <div>
                <label class="form-label">Employee Email:</label>
                <input type="email" name="employee_email" value="${escapeHtml(employee_email) || ''}" placeholder="john@company.com"
                       class="form-control-sm">
              </div>
              <div>
                <label class="form-label">Start Date:</label>
                <input type="date" name="start_date" value="${start_date || ''}"
                       class="form-control-sm">
              </div>
              <div>
                <label class="form-label">End Date:</label>
                <input type="date" name="end_date" value="${end_date || ''}"
                       class="form-control-sm">
              </div>
              <div>
                <label class="form-label">Ticker/ISIN:</label>
                <input type="text" name="ticker" value="${escapeHtml(ticker) || ''}" placeholder="e.g., AAPL or US1234567890"
                       class="form-control-sm text-uppercase">
              </div>
              <div>
                <label class="form-label">Instrument:</label>
                <select name="instrument_type" class="form-control-sm">
                  <option value="">All Instruments</option>
                  <option value="equity" ${instrument_type === 'equity' ? 'selected' : ''}>Equity (Stocks)</option>
                  <option value="bond" ${instrument_type === 'bond' ? 'selected' : ''}>Bond (ISIN)</option>
                </select>
              </div>
              <div>
                <label class="form-label">Type:</label>
                <select name="trading_type" class="form-control-sm">
                  <option value="">All Types</option>
                  <option value="buy" ${trading_type === 'buy' ? 'selected' : ''}>Buy</option>
                  <option value="sell" ${trading_type === 'sell' ? 'selected' : ''}>Sell</option>
                </select>
              </div>
              <div>
                <label class="form-label">Status:</label>
                <select name="status" class="form-control-sm">
                  <option value="">All Statuses</option>
                  <option value="pending" ${status === 'pending' ? 'selected' : ''}>Pending</option>
                  <option value="approved" ${status === 'approved' ? 'selected' : ''}>Approved</option>
                  <option value="rejected" ${status === 'rejected' ? 'selected' : ''}>Rejected</option>
                </select>
              </div>
              <div>
                <label class="form-label">Escalated:</label>
                <select name="escalated" class="form-control-sm">
                  <option value="">All</option>
                  <option value="true" ${escalated === 'true' ? 'selected' : ''}>Yes</option>
                  <option value="false" ${escalated === 'false' ? 'selected' : ''}>No</option>
                </select>
              </div>
            </div>
            <div class="mt-6 text-center">
              <div class="btn-group btn-group-mobile">
                <button type="submit" class="btn btn-primary w-full-mobile focus-ring">Apply Filters</button>
                <a href="/admin-requests" class="btn btn-secondary text-decoration-none w-full-mobile focus-ring">Clear Filters</a>
                <a href="/admin-export-trading-requests" class="btn btn-outline text-decoration-none w-full-mobile focus-ring">Export CSV</a>
              </div>
            </div>
          </form>
        </div>
      </div>

      <!-- Results Card -->
      <div class="card hover-shadow">
        <div class="card-header">
          <h3 class="card-title m-0">Trading Requests</h3>
          <p class="mt-2 m-0 text-muted text-sm">${pagination ? `${pagination.total} total, showing ${allRequests.length}` : `${allRequests.length} requests`} - Page ${pagination?.page || 1}/${pagination?.pages || 1}</p>
        </div>
        <div class="card-body p-0">
          ${allRequests.length > 0 ? `
            <div class="table-responsive">
              <table class="modern-table table-zebra table-sticky">
                <thead>
                  <tr>
                    <th>Request ID</th>
                    <th>Date</th>
                    <th>Employee</th>
                    <th>Company</th>
                    <th>Ticker/ISIN</th>
                    <th>Instrument</th>
                    <th>Type</th>
                    <th>Shares</th>
                    <th>Total Value (USD)</th>
                    <th>Status</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  ${tableRows}
                </tbody>
              </table>
            </div>
            ${pagination && pagination.pages > 1 ? `
            <div class="mt-4 d-flex justify-center align-items-center gap-2">
              ${pagination.page > 1 ? `
                <a href="/admin-requests?${paginationPrevParams}"
                   class="btn btn-secondary btn-sm text-decoration-none">← Previous</a>
              ` : '<span class="btn btn-secondary btn-sm opacity-50 cursor-not-allowed">← Previous</span>'}

              <span class="px-3">
                Page ${pagination.page} of ${pagination.pages} (${pagination.total} total)
              </span>

              ${pagination.page < pagination.pages ? `
                <a href="/admin-requests?${paginationNextParams}"
                   class="btn btn-secondary btn-sm text-decoration-none">Next →</a>
              ` : '<span class="btn btn-secondary btn-sm opacity-50 cursor-not-allowed">Next →</span>'}
            </div>
            ` : ''}
          ` : `
            <div class="text-center p-8 text-muted">
              <p>No trading requests found${Object.keys(filters).length > 0 ? ' matching your filters' : ''}.</p>
            </div>
          `}
        </div>
      </div>
    `;
}

module.exports = { requestsTemplate };
