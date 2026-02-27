const { formatHongKongTime } = require('../shared/formatters');
const { generateSortableHeader, generateRestrictedStocksSortingControls } = require('../shared/sorting');
const { escapeHtml } = require('../../utils/formatters');

/**
 * Render restricted stocks management page
 * @param {Object} data
 * @param {string} data.banner - notification banner HTML
 * @param {Array} data.restrictedStocks - array of restricted stock objects
 * @param {Array} data.changelog - array of changelog entries
 * @param {string} data.csrfInput - CSRF hidden input tag
 * @param {string} data.sortBy - current sort field
 * @param {string} data.sortOrder - current sort order (ASC/DESC)
 * @param {Object} data.queryParams - current query parameters for sort links
 * @returns {string} HTML content
 */
function restrictedStocksTemplate({ banner, restrictedStocks, changelog, csrfInput, sortBy, sortOrder, queryParams }) {
  // Build table rows
  const stockRows = restrictedStocks.map(stock => `
      <tr>
        <td class="td-center font-weight-600">${escapeHtml(stock.ticker)}</td>
        <td>${escapeHtml(stock.company_name)}</td>
        <td class="td-center">${formatHongKongTime(new Date(stock.created_at))}</td>
        <td class="td-center">
          <form method="post" action="/admin-remove-stock" class="d-inline">
            ${csrfInput}
            <input type="hidden" name="ticker" value="${escapeHtml(stock.ticker)}">
            <button type="submit" class="btn btn-danger btn-sm">Remove</button>
          </form>
        </td>
      </tr>
    `).join('');

  // Build changelog rows
  const changelogRows = changelog.map(change => {
    const actionClass = change.action === 'added' ? 'text-success' : 'text-danger';
    const actionIcon = change.action === 'added' ? '+' : '−';

    return `
        <tr>
          <td class="td-center">${formatHongKongTime(new Date(change.created_at), true)}</td>
          <td class="td-center font-weight-600">${escapeHtml(change.ticker)}</td>
          <td>${escapeHtml(change.company_name)}</td>
          <td class="td-center">
            <span class="${actionClass} font-weight-600">
              ${actionIcon} ${change.action.toUpperCase()}
            </span>
          </td>
          <td class="td-center">${escapeHtml(change.admin_email)}</td>
          <td class="td-center">${escapeHtml(change.reason) || 'N/A'}</td>
        </tr>
      `;
  }).join('');

  return `
      ${banner}
      <div class="card">
        <div class="card-header">
          <h3 class="card-title">Add Restricted Stock</h3>
        </div>
        <div class="card-body p-6">
          <form method="post" action="/admin-add-stock">
            ${csrfInput}
            <div class="d-flex gap-4 align-items-center">
              <label class="form-label mb-0">Stock Ticker / Bond ISIN *</label>
              <div class="flex-grow-1">
                <input type="text" name="ticker" required placeholder="e.g., AAPL, US037833AT77"
                       class="form-control text-uppercase">
              </div>
              <button type="submit" class="btn btn-primary">Add</button>
            </div>
          </form>
        </div>
      </div>

      <div class="card mt-6">
        <div class="card-header">
          <h3 class="card-title">Restricted Instruments List</h3>
          <p class="mt-2 m-0 text-muted text-sm">${restrictedStocks.length} instruments restricted</p>
          ${restrictedStocks.length > 0 ? `
            <div class="mt-4">
              ${generateRestrictedStocksSortingControls('/admin-restricted-stocks', sortBy, sortOrder, queryParams)}
            </div>
          ` : ''}
        </div>
        <div class="card-body p-0">
          ${restrictedStocks.length > 0 ? `
            <div class="table-responsive">
              <table class="modern-table table-zebra table-sticky">
                <thead>
                  <tr>
                    ${generateSortableHeader('ticker', 'Ticker', '/admin-restricted-stocks', sortBy, sortOrder, queryParams)}
                    ${generateSortableHeader('company_name', 'Company Name', '/admin-restricted-stocks', sortBy, sortOrder, queryParams)}
                    ${generateSortableHeader('created_at', 'Date Added', '/admin-restricted-stocks', sortBy, sortOrder, queryParams)}
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  ${stockRows}
                </tbody>
              </table>
            </div>
          ` : '<p>No restricted stocks configured</p>'}
        </div>
      </div>

      <div class="card mt-6">
        <div class="card-header">
          <h3 class="card-title">Recent Changes</h3>
          <p class="mt-2 m-0 text-muted text-sm">Last 20 modifications</p>
        </div>
        <div class="card-body p-0">
          ${changelog.length > 0 ? `
            <div class="table-responsive">
              <table class="modern-table table-zebra table-sticky">
                <thead>
                  <tr>
                    <th>Date/Time</th>
                    <th>Ticker</th>
                    <th>Company</th>
                    <th>Action</th>
                    <th>Admin</th>
                    <th>Reason</th>
                  </tr>
                </thead>
                <tbody>
                  ${changelogRows}
                </tbody>
              </table>
            </div>
          ` : '<p>No recent changes</p>'}
        </div>
      </div>
    `;
}

module.exports = { restrictedStocksTemplate };
