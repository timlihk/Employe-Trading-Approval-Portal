// Template: Statement scheduler page
// Receives a plain data object, returns an HTML string

const { renderCard } = require('../../utils/templates');

/**
 * @param {object} data
 * @param {string} data.banner - pre-rendered notification banner HTML
 * @param {object} data.status - scheduler status object
 * @param {boolean} data.status.isRunning
 * @param {string} data.status.schedule
 * @param {string} data.status.timezone
 * @param {string} data.status.nextRun
 * @param {string} data.status.reminderSchedule
 * @param {string} data.csrfInput - pre-rendered CSRF hidden input HTML
 * @returns {string} HTML string
 */
function renderScheduler(data) {
  const { banner, status, csrfInput } = data;

  const statusDot = status.isRunning
    ? '<span class="status-indicator"><span class="status-dot status-dot-success"></span> Running</span>'
    : '<span class="status-indicator"><span class="status-dot status-dot-danger"></span> Stopped</span>';

  return `
        ${banner}
        ${renderCard('Statement Request Scheduler', `
          <div class="scheduler-panel">
            <div class="scheduler-row">
              <span class="scheduler-label">Status</span>
              <span class="scheduler-value">${statusDot}</span>
            </div>
            <div class="scheduler-row">
              <span class="scheduler-label">Schedule</span>
              <span class="scheduler-value">${status.schedule || 'Not configured'}</span>
            </div>
            <div class="scheduler-row">
              <span class="scheduler-label">Timezone</span>
              <span class="scheduler-value">${status.timezone}</span>
            </div>
            <div class="scheduler-row">
              <span class="scheduler-label">Next Run</span>
              <span class="scheduler-value">${status.nextRun || 'N/A'}</span>
            </div>
            <div class="scheduler-row">
              <span class="scheduler-label">Daily Reminders</span>
              <span class="scheduler-value">${status.reminderSchedule || 'Every day at 9 AM HKT'}</span>
            </div>
          </div>

          <div class="config-hint">
            <h4>Environment Variables</h4>
            <p class="text-sm text-muted">
              <code>STATEMENT_REQUEST_SCHEDULE</code> Cron schedule (default: 7th of month, 9 AM HKT)<br>
              <code>STATEMENT_SENDER_EMAIL</code> Sender email address<br>
              <code>STATEMENT_UPLOAD_DEADLINE_DAYS</code> Days until deadline (default: 14)<br>
              <code>SHAREPOINT_SITE_URL</code> SharePoint site for file storage<br>
              <code>DISABLE_STATEMENT_REQUESTS</code> Set to "true" to disable
            </p>
          </div>

          <div class="action-bar">
            <form method="post" action="/admin-trigger-statement-request">
              ${csrfInput}
              <button type="submit" class="btn btn-primary">Trigger Manual Send</button>
            </form>
            <form method="post" action="/admin-test-sharepoint">
              ${csrfInput}
              <button type="submit" class="btn btn-secondary">Test SharePoint Connection</button>
            </form>
          </div>
        `)}
        <a href="/admin-statements" class="btn btn-secondary mt-4">Back to Statements</a>`;
}

module.exports = renderScheduler;
