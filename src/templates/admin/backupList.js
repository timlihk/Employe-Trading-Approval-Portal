/**
 * Render backup list / management page
 * @param {Object} data
 * @param {string} data.notification - notification banner HTML
 * @param {Array} data.backups - array of backup objects { filename, created, size }
 * @param {Object} data.schedulerStatus - scheduler status { isRunning, nextRun }
 * @param {string} data.csrfInput - CSRF hidden input tag
 * @param {string} data.storageDescription - description of current storage location
 * @returns {string} HTML content
 */
function backupListTemplate({ notification, backups, schedulerStatus, csrfInput, storageDescription }) {
  return `
      <div class="container">
        ${notification}

        <div class="card mb-4">
          <div class="card-header">
            <h3 class="card-title">Automatic Backup Status</h3>
          </div>
          <div class="card-body">
            <div class="d-flex justify-content-between align-items-center">
              <div>
                <span class="badge ${schedulerStatus.isRunning ? 'badge-success' : 'badge-warning'} badge-sm">
                  ${schedulerStatus.isRunning ? 'Scheduler Active' : 'Scheduler Inactive'}
                </span>
                ${schedulerStatus.nextRun ? `
                  <div class="mt-2 text-muted">
                    Next backup: ${new Date(schedulerStatus.nextRun).toLocaleString('en-US', { timeZone: 'Asia/Hong_Kong' })}
                  </div>
                ` : ''}
              </div>
              <a href="/admin-backup-scheduler" class="btn btn-sm btn-secondary">
                Configure Scheduler
              </a>
            </div>
          </div>
        </div>

        <div class="card mb-4">
          <div class="card-header">
            <h3 class="card-title">Manual Backup Options</h3>
          </div>
          <div class="card-body">
            <div class="d-flex gap-3 flex-wrap justify-center">
              <a href="/admin-backup-database" class="btn btn-primary text-decoration-none">
                Download JSON Backup
              </a>
              <a href="/admin-backup-database-sql" class="btn btn-primary text-decoration-none">
                Download SQL Backup
              </a>
              <form method="post" action="/admin-store-backup" class="d-inline">
                ${csrfInput}
                <button type="submit" class="btn btn-success">
                  Create & Store on Server
                </button>
              </form>
            </div>
            <div class="alert alert-info mt-4 mb-0">
              <strong>Format Guide:</strong>
              <ul class="mb-0 mt-2">
                <li><strong>JSON</strong>: Human-readable, easy to inspect and modify</li>
                <li><strong>SQL</strong>: Can be imported directly via psql, more portable</li>
                <li><strong>Server Storage</strong>: ${storageDescription}</li>
                <li><strong>Automatic Backups</strong>: Run daily at 2 AM HKT by default</li>
              </ul>
            </div>
          </div>
        </div>

        <div class="card">
          <div class="card-header">
            <h3 class="card-title">Stored Backups on Server</h3>
          </div>
          <div class="card-body">
            ${backups.length === 0 ? `
              <p class="text-center text-muted">No backups stored on server yet.</p>
              <p class="text-center text-muted">Click "Create & Store on Server" above to create your first backup.</p>
            ` : `
              <div class="table-responsive">
                <table class="table">
                  <thead>
                    <tr>
                      <th>Filename</th>
                      <th>Created</th>
                      <th>Size</th>
                      <th>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    ${backups.map(backup => `
                      <tr>
                        <td><code>${backup.filename}</code></td>
                        <td>${new Date(backup.created).toLocaleString('en-US', { timeZone: 'Asia/Hong_Kong' })}</td>
                        <td>${Math.round(backup.size / 1024)} KB</td>
                        <td>
                          <a href="/admin-download-backup?filename=${encodeURIComponent(backup.filename)}"
                             class="btn btn-sm btn-primary">
                            Download
                          </a>
                        </td>
                      </tr>
                    `).join('')}
                  </tbody>
                </table>
              </div>
              <div class="alert alert-warning mt-4">
                <strong>Storage Policy:</strong> Only the last 5 backups are kept on the server. Older backups are automatically deleted to save space.
              </div>
            `}
          </div>
        </div>

        <div class="mt-6 text-center">
          <a href="/admin-dashboard" class="btn btn-secondary text-decoration-none">
            ← Back to Dashboard
          </a>
        </div>
      </div>
    `;
}

module.exports = { backupListTemplate };
