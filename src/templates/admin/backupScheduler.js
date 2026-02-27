/**
 * Render backup scheduler status page
 * @param {Object} data
 * @param {Object} data.status - scheduler status object
 * @param {boolean} data.status.isRunning
 * @param {string} data.status.schedule
 * @param {string} data.status.timezone
 * @param {string|null} data.status.nextRun
 * @param {boolean} data.status.sharepointEnabled
 * @param {string} data.csrfInput - CSRF hidden input tag
 * @returns {string} HTML content
 */
function backupSchedulerTemplate({ status, csrfInput }) {
  return `
      <div class="container">
        <div class="card">
          <div class="card-header">
            <h3 class="card-title">Automatic Backup Scheduler</h3>
          </div>
          <div class="card-body">
            <div class="alert ${status.isRunning ? 'alert-success' : 'alert-warning'}">
              <strong>Status:</strong> ${status.isRunning ? 'Running' : 'Stopped'}
            </div>

            <div class="info-grid">
              <div class="info-item">
                <strong>Schedule:</strong> <code>${status.schedule}</code>
              </div>
              <div class="info-item">
                <strong>Timezone:</strong> ${status.timezone}
              </div>
              <div class="info-item">
                <strong>Next Run:</strong> ${status.nextRun ? new Date(status.nextRun).toLocaleString('en-US', { timeZone: 'Asia/Hong_Kong' }) : 'N/A'}
              </div>
              <div class="info-item">
                <strong>SharePoint Backup:</strong> ${status.sharepointEnabled ? 'Enabled' : 'Not configured (local only)'}
              </div>
            </div>

            <div class="alert alert-info mt-4">
              <strong>Schedule Format:</strong> Cron expression (seconds minutes hours day month day-of-week)
              <ul class="mt-2 mb-0">
                <li><code>0 0 2 * * *</code> = Daily at 2:00 AM</li>
                <li><code>0 0 */6 * * *</code> = Every 6 hours</li>
                <li><code>0 0 3 * * 1</code> = Weekly on Monday at 3:00 AM</li>
              </ul>
            </div>

            <div class="mt-4 text-center">
              <form method="post" action="/admin-trigger-backup" class="d-inline">
                ${csrfInput}
                <button type="submit" class="btn btn-primary">
                  🔄 Trigger Manual Backup Now
                </button>
              </form>
            </div>
          </div>
        </div>

        <div class="mt-4 text-center">
          <a href="/admin-backup-list" class="btn btn-secondary text-decoration-none">
            ← Back to Backup Management
          </a>
        </div>
      </div>
    `;
}

module.exports = { backupSchedulerTemplate };
