// Template: Statement upload form page
// Receives a plain data object, returns an HTML string

/**
 * @param {object} data
 * @param {string} data.banner - pre-rendered notification banner HTML
 * @param {string} data.token - upload token
 * @param {string} data.monthName - display month name
 * @param {number} data.periodYear
 * @param {string} data.employeeDisplay - employee name or email
 * @param {string} data.deadlineStr - formatted deadline string
 * @param {boolean} data.isOverdue
 * @param {string} data.accountOptions - pre-rendered <option> HTML for brokerage accounts
 * @returns {string} HTML string
 */
function renderUploadForm(data) {
  const {
    banner,
    token,
    monthName,
    periodYear,
    employeeDisplay,
    deadlineStr,
    isOverdue,
    accountOptions,
  } = data;

  return `
        ${banner}
        <div class="upload-container">
          <div class="card">
            <div class="card-header">
              <h3 class="card-title">Upload Trading Statement</h3>
            </div>
            <div class="card-body">
              <dl class="upload-meta">
                <dt>Period</dt>
                <dd>${monthName} ${periodYear}</dd>
                <dt>Employee</dt>
                <dd>${employeeDisplay}</dd>
                <dt>Deadline</dt>
                <dd>${deadlineStr}${isOverdue ? ' <span class="table-status overdue">Overdue</span>' : ''}</dd>
              </dl>

              <form method="post" action="/upload-statement/${token}" enctype="multipart/form-data">
                <div class="mb-6">
                  <label class="form-label">Brokerage Account</label>
                  <select name="brokerage_select" class="form-control brokerage-select">
                    <option value="">Select account...</option>
                    ${accountOptions}
                    <option value="__new__">+ Other (type below)</option>
                  </select>
                </div>
                <div class="mb-6 new-brokerage-field">
                  <label class="form-label">Brokerage Name</label>
                  <input type="text" name="brokerage_new" placeholder="e.g., Interactive Brokers — U12345678"
                         class="form-control" maxlength="255">
                </div>
                <div class="mb-6">
                  <label class="form-label">Statement File</label>
                  <div class="file-input-wrapper">
                    <input type="file" name="statement" required
                           accept=".pdf,.png,.jpg,.jpeg,.csv,.xlsx">
                    <span class="file-input-icon">&#128196;</span>
                    <span class="file-input-text">Click to select a file</span>
                    <span class="file-input-hint">PDF, PNG, JPG, CSV, XLSX — max 10 MB</span>
                    <span class="file-input-selected">
                      <span class="file-input-selected-icon">&#10003;</span>
                      File selected — click to change
                    </span>
                  </div>
                </div>
                <div class="mb-6">
                  <label class="form-label">Notes (optional)</label>
                  <textarea name="notes" rows="3"
                            placeholder="Any additional notes about this statement..."
                            class="form-control resize-vertical"></textarea>
                </div>
                <button type="submit" class="btn btn-primary w-full">
                  Upload Statement
                </button>
              </form>
            </div>
          </div>
        </div>`;
}

module.exports = renderUploadForm;
