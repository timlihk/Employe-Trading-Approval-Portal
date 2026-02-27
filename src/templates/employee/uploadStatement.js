// Statement upload page template

/**
 * @param {object} data
 * @param {string} data.banner            - pre-rendered notification banner HTML
 * @param {string} data.csrfInput         - hidden CSRF input HTML
 * @param {Array}  data.accounts          - brokerage accounts
 * @param {string} data.selectedAccountUuid - pre-selected account UUID
 * @param {Array}  data.periodOptions     - array of { value, label } for month/year periods
 * @returns {string} HTML
 */
function renderUploadStatement(data) {
  const {
    banner,
    csrfInput,
    accounts,
    selectedAccountUuid,
    periodOptions,
  } = data;

  // Build account options
  const accountOptionsHtml = accounts.map(a => {
    const selected = a.uuid === selectedAccountUuid ? 'selected' : '';
    return `<option value="${a.uuid}" ${selected}>${a.firm_name} — ${a.account_number}</option>`;
  }).join('');

  // Build period options
  const periodOptionsHtml = periodOptions.map(p =>
    `<option value="${p.value}">${p.label}</option>`
  ).join('');

  return `
    ${banner}
    <div class="card">
      <div class="card-header">
        <h3 class="card-title">Upload Trading Statement</h3>
      </div>
      <div class="card-body p-6">
        <form method="post" action="/employee-upload-statement" enctype="multipart/form-data">
          ${csrfInput}

          <div class="grid grid-auto gap-4 grid-mobile-stack">
            <div>
              <label class="form-label">Brokerage Account</label>
              <select name="account_uuid" required class="form-control">
                <option value="">Select account...</option>
                ${accountOptionsHtml}
              </select>
            </div>

            <div>
              <label class="form-label">Statement Period</label>
              <select name="period" required class="form-control">
                <option value="">Select month...</option>
                ${periodOptionsHtml}
              </select>
            </div>
          </div>

          <div class="mt-4">
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

          <div class="mt-4">
            <label class="form-label">Notes (optional)</label>
            <textarea name="notes" rows="3"
                      placeholder="Any additional notes about this statement..."
                      class="form-control resize-vertical"></textarea>
          </div>

          <div class="mt-6 text-center">
            <button type="submit" class="btn btn-primary w-full-mobile">
              Upload Statement
            </button>
          </div>
        </form>
      </div>
    </div>

    <div class="mt-4">
      <a href="/employee-dashboard" class="btn btn-secondary">Back to Dashboard</a>
    </div>
  `;
}

module.exports = { renderUploadStatement };
