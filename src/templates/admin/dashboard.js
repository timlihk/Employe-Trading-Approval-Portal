/**
 * Render admin dashboard page
 * @param {Object} data
 * @param {string} data.banner - notification banner HTML
 * @param {number} data.pendingCount
 * @param {number} data.escalatedCount
 * @param {number} data.todayCount
 * @param {number} data.restrictedCount
 * @returns {string} HTML content
 */
function dashboardTemplate({ banner, pendingCount, escalatedCount, todayCount, restrictedCount }) {
  return `
      ${banner}

      <div class="metrics-grid">
        <div class="card card-metric">
          <div class="metric-value">${pendingCount}</div>
          <div class="metric-label">Pending Requests</div>
        </div>
        <div class="card card-metric">
          <div class="metric-value">${escalatedCount}</div>
          <div class="metric-label">Escalated</div>
        </div>
        <div class="card card-metric">
          <div class="metric-value">${todayCount}</div>
          <div class="metric-label">Today</div>
        </div>
        <div class="card card-metric">
          <div class="metric-value">${restrictedCount}</div>
          <div class="metric-label">Restricted Stocks</div>
        </div>
      </div>

      <div class="card mb-6">
        <div class="card-header">
          <h3 class="card-title">Quick Actions</h3>
        </div>
        <div class="card-body">
          <ul class="action-list">
            <li>
              <a href="/admin-requests" class="action-item">
                <span>Review All Requests</span>
                <span class="action-arrow" aria-hidden="true">&#8250;</span>
              </a>
            </li>
            <li>
              <a href="/admin-requests?escalated=true" class="action-item">
                <span>Review Escalated Requests</span>
                <span class="action-arrow" aria-hidden="true">&#8250;</span>
              </a>
            </li>
            <li>
              <a href="/admin-restricted-stocks" class="action-item">
                <span>Manage Restricted Stocks</span>
                <span class="action-arrow" aria-hidden="true">&#8250;</span>
              </a>
            </li>
            <li>
              <a href="/admin-statements" class="action-item">
                <span>Statement Requests</span>
                <span class="action-arrow" aria-hidden="true">&#8250;</span>
              </a>
            </li>
            <li>
              <a href="/admin-audit-log" class="action-item">
                <span>View Audit Log</span>
                <span class="action-arrow" aria-hidden="true">&#8250;</span>
              </a>
            </li>
            <li>
              <a href="/admin-backup-list" class="action-item">
                <span>Backup Management</span>
                <span class="action-arrow" aria-hidden="true">&#8250;</span>
              </a>
            </li>
            <li>
              <a href="/admin-clear-database-confirm" class="action-item">
                <span>Clear Database</span>
                <span class="action-arrow" aria-hidden="true">&#8250;</span>
              </a>
            </li>
          </ul>
        </div>
      </div>
    `;
}

module.exports = { dashboardTemplate };
