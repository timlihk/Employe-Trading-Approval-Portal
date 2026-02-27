const { formatHongKongTime } = require('../shared/formatters');

/**
 * Render audit log viewer page
 * @param {Object} data
 * @param {Array} data.auditLogs - array of audit log entries
 * @param {Object} data.pagination - pagination info
 * @param {Object} data.filters - current filter values
 * @returns {string} HTML content
 */
function auditLogTemplate({ auditLogs, pagination, filters }) {
  const { user_email, user_type, action, target_type, start_date, end_date } = filters;

  // Build audit log rows
  const auditRows = auditLogs.map(log => `
      <tr>
        <td class="td-center">${formatHongKongTime(new Date(log.created_at), true)}</td>
        <td>${log.user_email}</td>
        <td class="td-center">
          <span class="badge ${log.user_type === 'admin' ? 'badge-danger' : 'badge-info'}">${log.user_type.toUpperCase()}</span>
        </td>
        <td>${log.action}</td>
        <td class="td-center">${log.target_type}</td>
        <td class="td-center">${log.target_id || 'N/A'}</td>
        <td class="max-w-200 break-word">${log.details || 'N/A'}</td>
        <td class="td-center text-monospace text-xs">${log.ip_address || 'N/A'}</td>
      </tr>
    `).join('');

  return `
      <div class="card">
        <div class="card-header">
          <h3 class="card-title">Filter Audit Logs</h3>
        </div>
        <div class="card-body p-6">
          <form method="get" action="/admin-audit-log">
            <div class="grid grid-auto gap-4 grid-mobile-stack">
              <div>
                <label class="form-label">User Email:</label>
                <input type="text" name="user_email" value="${user_email || ''}"
                       placeholder="Filter by email" class="form-control-sm">
              </div>
              <div>
                <label class="form-label">User Type:</label>
                <select name="user_type" class="form-control-sm">
                  <option value="">All Types</option>
                  <option value="admin" ${user_type === 'admin' ? 'selected' : ''}>Admin</option>
                  <option value="employee" ${user_type === 'employee' ? 'selected' : ''}>Employee</option>
                </select>
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
            </div>
            <div class="mt-6 text-center">
              <div class="btn-group btn-group-mobile">
                <button type="submit" class="btn btn-primary w-full-mobile">Apply Filters</button>
                <a href="/admin-audit-log" class="btn btn-secondary text-decoration-none w-full-mobile">Clear Filters</a>
                <a href="/admin-export-audit-log" class="btn btn-outline text-decoration-none w-full-mobile">Export CSV</a>
              </div>
            </div>
          </form>
        </div>
      </div>

      <div class="card mt-6">
        <div class="card-header">
          <h3 class="card-title">Audit Log Results</h3>
          <p class="mt-2 m-0 text-muted text-sm">${auditLogs.length} entries found</p>
        </div>
        <div class="card-body p-0">
          <div class="table-responsive">
            <table class="modern-table table-zebra table-sticky">
              <thead>
                <tr>
                  <th class="text-center">Date & Time</th>
                  <th>User Email</th>
                  <th class="text-center">Type</th>
                  <th>Action</th>
                  <th class="text-center">Target</th>
                  <th class="text-center">Target ID</th>
                  <th>Details</th>
                  <th class="text-center">IP Address</th>
                </tr>
              </thead>
              <tbody>
                ${auditRows || '<tr><td colspan="8" class="text-center text-gray-600">No audit logs found</td></tr>'}
              </tbody>
            </table>
          </div>
          <div class="card-body">
            <p class="text-muted text-sm m-0">
              Showing latest 100 entries. Use filters to narrow down results.
            </p>
          </div>
        </div>
      </div>

    `;
}

module.exports = { auditLogTemplate };
