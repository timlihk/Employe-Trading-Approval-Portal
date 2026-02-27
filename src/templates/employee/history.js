// Employee trading history template — filters, table, pagination

const { formatHongKongTime } = require('../shared/formatters');
const { getDisplayId, escapeHtml } = require('../../utils/formatters');

/**
 * @param {object} data
 * @param {string} data.banner              - pre-rendered notification banner HTML
 * @param {Array}  data.requests            - trading request objects
 * @param {object} data.pagination          - { total, page, pages }
 * @param {object} data.filters             - active filter values
 * @param {string} data.filters.start_date
 * @param {string} data.filters.end_date
 * @param {string} data.filters.ticker
 * @param {string} data.filters.trading_type
 * @param {string} data.filters.status
 * @param {string} data.filters.instrument_type
 * @param {string} data.currentSortBy
 * @param {string} data.currentSortOrder
 * @param {object} data.queryParams         - raw query params for building URLs
 * @param {number} data.filterCount         - number of active filter keys (for empty state message)
 * @returns {string} HTML
 */
function renderHistory(data) {
  const {
    banner,
    requests,
    pagination,
    filters,
    currentSortBy,
    currentSortOrder,
    queryParams,
    filterCount,
  } = data;

  // Generate table rows
  const tableRows = requests.map(request => {
    const date = formatHongKongTime(new Date(request.created_at));

    return `
      <tr>
        <td class="text-center">${getDisplayId(request)}</td>
        <td class="text-center">${date}</td>
        <td>${escapeHtml(request.stock_name) || 'N/A'}</td>
        <td class="text-center font-weight-600">${escapeHtml(request.ticker)}</td>
        <td class="text-center">
          <span class="badge ${request.instrument_type === 'bond' ? 'badge-info' : 'badge-secondary'}">
            ${request.instrument_type === 'bond' ? 'Bond' : 'Equity'}
          </span>
        </td>
        <td class="text-center">${request.trading_type.toUpperCase()}</td>
        <td class="text-right">${parseInt(request.shares).toLocaleString()}</td>
        <td class="text-right">
          $${parseFloat(request.total_value_usd || request.total_value || 0).toLocaleString('en-US', {minimumFractionDigits: 2})}
        </td>
        <td class="text-center">
          <span class="status-${request.status}">${request.status.toUpperCase()}</span>
        </td>
        <td class="text-center">
          ${request.status === 'rejected' && request.rejection_reason ?
            `<span class="text-danger cursor-help text-sm" title="${escapeHtml(request.rejection_reason)}">View Reason</span>` :
            (request.status === 'pending' && !request.escalated ?
              `<a href="/escalate-form/${request.uuid}" class="btn btn-outline btn-sm text-decoration-none">Escalate</a>` :
              (request.escalated ?
                '<span class="text-warning text-sm">Escalated</span>' :
                '<span class="text-muted">–</span>')
            )
          }
        </td>
      </tr>
    `;
  });

  // Helper to build sort URLs
  function sortUrl(sortBy) {
    const params = new URLSearchParams({
      ...queryParams,
      sort_by: sortBy,
      sort_order: currentSortBy === sortBy && currentSortOrder === 'ASC' ? 'DESC' : 'ASC'
    });
    return `/employee-history?${params.toString()}`;
  }

  // Helper to build pagination URLs
  function pageUrl(pageNum) {
    const params = new URLSearchParams({ ...queryParams, page: pageNum });
    return `/employee-history?${params.toString()}`;
  }

  const exportParams = new URLSearchParams(queryParams).toString();

  return `
    ${banner}

    <!-- Filters Card -->
    <div class="card mb-6">
      <div class="card-header">
        <h3 class="card-title">Filter Requests</h3>
      </div>
      <div class="card-body p-4">
        <form method="get" action="/employee-history">
          <div class="grid grid-filters gap-2 grid-mobile-stack">
            <div>
              <label class="form-label">Start Date:</label>
              <input type="date" name="start_date" value="${filters.start_date || ''}"
                     class="form-control-sm">
            </div>
            <div>
              <label class="form-label">End Date:</label>
              <input type="date" name="end_date" value="${filters.end_date || ''}"
                     class="form-control-sm">
            </div>
            <div>
              <label class="form-label">Ticker:</label>
              <input type="text" name="ticker" value="${escapeHtml(filters.ticker) || ''}" placeholder="e.g., AAPL"
                     class="form-control-sm text-uppercase">
            </div>
            <div>
              <label class="form-label">Type:</label>
              <select name="trading_type" class="form-control-sm">
                <option value="">All Types</option>
                <option value="buy" ${filters.trading_type === 'buy' ? 'selected' : ''}>Buy</option>
                <option value="sell" ${filters.trading_type === 'sell' ? 'selected' : ''}>Sell</option>
              </select>
            </div>
            <div>
              <label class="form-label">Status:</label>
              <select name="status" class="form-control-sm">
                <option value="">All Statuses</option>
                <option value="approved" ${filters.status === 'approved' ? 'selected' : ''}>Approved</option>
                <option value="rejected" ${filters.status === 'rejected' ? 'selected' : ''}>Rejected</option>
                <option value="pending" ${filters.status === 'pending' ? 'selected' : ''}>Pending</option>
              </select>
            </div>
            <div>
              <label class="form-label">Instrument:</label>
              <select name="instrument_type" class="form-control-sm">
                <option value="">All Instruments</option>
                <option value="equity" ${filters.instrument_type === 'equity' ? 'selected' : ''}>Equity (Stocks)</option>
                <option value="bond" ${filters.instrument_type === 'bond' ? 'selected' : ''}>Bond (ISIN)</option>
              </select>
            </div>
          </div>
          <div class="mt-4 text-center">
            <div class="btn-group btn-group-mobile">
              <button type="submit" class="btn btn-primary w-full-mobile">Apply Filters</button>
              <a href="/employee-history" class="btn btn-secondary text-decoration-none w-full-mobile">Clear Filters</a>
            </div>
          </div>
        </form>
      </div>
    </div>

    <!-- Results Card -->
    <div class="card">
      <div class="card-header">
        <h3 class="card-title">Trading Request History</h3>
        <p class="mt-2 m-0 text-muted text-sm">${pagination ? `${pagination.total} total, showing ${requests.length}` : `${requests.length} requests`} · Page ${pagination?.page || 1} of ${pagination?.pages || 1}</p>
      </div>
      <div class="card-body p-0">
        ${requests.length > 0 ? `
          <div class="table-responsive">
            <table class="modern-table table-zebra table-sticky">
              <thead>
                <tr>
                  <th class="th-sortable" ${currentSortBy === 'created_at' ? `aria-sort="${currentSortOrder === 'ASC' ? 'ascending' : 'descending'}"` : ''}>
                    <a href="${sortUrl('created_at')}"
                       class="link focus-ring">
                      Request ID<span class="sr-only"> - Click to sort</span>
                    </a>
                  </th>
                  <th class="th-sortable" ${currentSortBy === 'created_at' ? `aria-sort="${currentSortOrder === 'ASC' ? 'ascending' : 'descending'}"` : ''}>
                    <a href="${sortUrl('created_at')}"
                       class="link focus-ring">
                      Date<span class="sr-only"> - Click to sort</span>
                    </a>
                  </th>
                  <th>Company</th>
                  <th class="th-sortable" ${currentSortBy === 'ticker' ? `aria-sort="${currentSortOrder === 'ASC' ? 'ascending' : 'descending'}"` : ''}>
                    <a href="${sortUrl('ticker')}"
                       class="link focus-ring">
                      Ticker/ISIN<span class="sr-only"> - Click to sort</span>
                    </a>
                  </th>
                  <th>Instrument</th>
                  <th>Type</th>
                  <th>Shares</th>
                  <th class="th-sortable" ${currentSortBy === 'total_value_usd' ? `aria-sort="${currentSortOrder === 'ASC' ? 'ascending' : 'descending'}"` : ''}>
                    <a href="${sortUrl('total_value_usd')}"
                       class="link focus-ring">
                      Total Value (USD)<span class="sr-only"> - Click to sort</span>
                    </a>
                  </th>
                  <th>Status</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                ${tableRows.join('')}
              </tbody>
            </table>
          </div>
          ${pagination && pagination.pages > 1 ? `
          <div class="pagination">
            ${pagination.page > 1 ? `
              <a href="${pageUrl(pagination.page - 1)}"
                 class="btn btn-secondary btn-sm" aria-label="Go to previous page">←</a>
            ` : '<button class="btn btn-secondary btn-sm" disabled aria-label="Previous page (disabled)">←</button>'}

            <span class="btn btn-primary btn-sm" aria-current="page">
              ${pagination.page}
            </span>

            ${pagination.page < pagination.pages ? `
              <a href="${pageUrl(pagination.page + 1)}"
                 class="btn btn-secondary btn-sm" aria-label="Go to next page">→</a>
            ` : '<button class="btn btn-secondary btn-sm" disabled aria-label="Next page (disabled)">→</button>'}

            <span class="text-muted text-sm">
              ${pagination.total} results
            </span>
          </div>
          ` : ''}
        ` : `
          <div class="text-center p-8 text-muted">
            <p>No trading requests found${filterCount > 0 ? ' matching your filters' : ''}.</p>
            <a href="/employee-dashboard" class="btn btn-primary mt-4 text-decoration-none">
              Submit Your First Request
            </a>
          </div>
        `}
      </div>
    </div>

    <div class="mt-6 text-center">
      <div class="btn-group btn-group-mobile">
        <a href="/employee-dashboard" class="btn btn-secondary text-decoration-none w-full-mobile focus-ring">
          ← Back to Dashboard
        </a>
        <a href="/employee-export-history?${exportParams}" class="btn btn-outline text-decoration-none w-full-mobile focus-ring">
          Export History (CSV)
        </a>
      </div>
    </div>

  `;
}

module.exports = { renderHistory };
