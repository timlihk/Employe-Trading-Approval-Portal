// Brokerage accounts management template
const { escapeHtml } = require('../../utils/formatters');

/**
 * @param {object} data
 * @param {string} data.banner           - pre-rendered notification banner HTML
 * @param {string} data.csrfInput        - hidden CSRF input HTML
 * @param {Array}  data.accounts         - brokerage accounts list
 * @param {object|null} data.editAccount - account being edited, or null
 * @param {boolean} data.isSetupMode     - true when no accounts exist yet
 * @param {boolean} data.isConfirmMode   - true when accounts exist but not confirmed
 * @returns {string} HTML
 */
function renderBrokerageAccounts(data) {
  const {
    banner,
    csrfInput,
    accounts,
    editAccount,
    isSetupMode,
    isConfirmMode,
  } = data;

  // Contextual banner for setup or confirmation
  let contextBanner = '';
  if (isSetupMode) {
    contextBanner = `
      <div class="alert-warning alert" role="alert">
        <strong>Welcome! Before you can submit trading requests or upload statements, you must register at least one brokerage account below.</strong>
      </div>`;
  } else if (isConfirmMode) {
    contextBanner = `
      <div class="alert-info alert" role="alert">
        <strong>Please review your brokerage accounts below and confirm they are complete and up to date.</strong>
      </div>`;
  }

  const accountRows = accounts.map(a => `
    <tr>
      <td class="font-weight-600">${escapeHtml(a.firm_name)}</td>
      <td>${escapeHtml(a.account_number)}</td>
      <td>
        <a href="/employee-brokerage-accounts?edit=${a.uuid}" class="btn btn-sm btn-secondary">Edit</a>
        <form method="post" action="/employee-remove-brokerage" class="d-inline">
          ${csrfInput}
          <input type="hidden" name="uuid" value="${a.uuid}">
          <button type="submit" class="btn btn-sm btn-danger">Remove</button>
        </form>
      </td>
    </tr>
  `).join('');

  // Confirmation section — shown when accounts exist but not confirmed
  const confirmationSection = isConfirmMode ? `
    <div class="card mt-6">
      <div class="card-body p-6 text-center">
        <p class="mb-4">I confirm that the brokerage accounts listed above are complete and up to date.</p>
        <form method="post" action="/employee-confirm-accounts">
          ${csrfInput}
          <button type="submit" class="btn btn-primary">Confirm Accounts Are Up to Date</button>
        </form>
      </div>
    </div>
  ` : '';

  // Only show back link when setup and confirmation are both done
  const backLink = (!isSetupMode && !isConfirmMode) ? `
    <div class="mt-4">
      <a href="/employee-dashboard" class="btn btn-secondary">Back to Dashboard</a>
    </div>
  ` : '';

  return `
    ${banner}
    ${contextBanner}
    <div class="card mb-6">
      <div class="card-header">
        <h3 class="card-title">${editAccount ? 'Edit Brokerage Account' : 'Add Brokerage Account'}</h3>
      </div>
      <div class="card-body p-6">
        <form method="post" action="${editAccount ? '/employee-edit-brokerage' : '/employee-add-brokerage'}">
          ${csrfInput}
          ${editAccount ? `<input type="hidden" name="uuid" value="${editAccount.uuid}">` : ''}
          <div class="grid grid-auto gap-4 grid-mobile-stack">
            <div>
              <label class="form-label">Firm Name</label>
              <input type="text" name="firm_name" required placeholder="e.g., Interactive Brokers"
                     value="${editAccount ? escapeHtml(editAccount.firm_name) : ''}"
                     class="form-control" maxlength="255">
            </div>
            <div>
              <label class="form-label">Account Number</label>
              <input type="text" name="account_number" required placeholder="e.g., U12345678"
                     value="${editAccount ? escapeHtml(editAccount.account_number) : ''}"
                     class="form-control" maxlength="100">
            </div>
          </div>
          <div class="mt-4">
            <button type="submit" class="btn btn-primary">${editAccount ? 'Save Changes' : 'Add Account'}</button>
            ${editAccount ? '<a href="/employee-brokerage-accounts" class="btn btn-secondary ml-2">Cancel</a>' : ''}
          </div>
        </form>
      </div>
    </div>

    <div class="card">
      <div class="card-header">
        <h3 class="card-title">Your Brokerage Accounts</h3>
      </div>
      <div class="card-body ${accounts.length === 0 ? '' : 'p-0'}">
        ${accounts.length > 0 ? `
          <div class="table-container">
            <table class="modern-table">
              <thead><tr><th>Firm</th><th>Account Number</th><th>Actions</th></tr></thead>
              <tbody>${accountRows}</tbody>
            </table>
          </div>
        ` : '<p class="text-muted text-center p-6">No brokerage accounts registered yet. Add one above to start uploading statements.</p>'}
      </div>
    </div>

    ${confirmationSection}
    ${backLink}
  `;
}

module.exports = { renderBrokerageAccounts };
