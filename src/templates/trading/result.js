// Template: Trade submission result page
// Receives a plain data object, returns an HTML string

const { getDisplayId } = require('../../utils/formatters');

/**
 * @param {object} data
 * @param {object} data.request - The trading request record
 * @param {string} data.status - 'approved' | 'rejected' | 'pending'
 * @param {string} data.csrfInput - pre-rendered CSRF hidden input HTML
 * @returns {string} HTML string
 */
function renderResult(data) {
  const { request, status, csrfInput } = data;

  let statusBanner = '';
  let statusText = '';

  if (status === 'approved') {
    statusBanner = `
            <div class="alert alert-success text-center">
              <h3 class="m-0">Request Approved</h3>
            </div>`;
    statusText = 'APPROVED';
  } else if (status === 'rejected') {
    statusBanner = `
          <div class="alert alert-error text-center">
            <h3 class="m-0">Request Rejected</h3>
            <p class="mt-2 m-0"><strong>You can escalate this request with a business justification below.</strong></p>
          </div>`;
    statusText = 'REJECTED';
  } else {
    statusBanner = `
          <div class="alert alert-info text-center">
            <h3 class="m-0">Request Created Successfully</h3>
            <p class="mt-2 m-0 text-muted">Your trading request has been submitted and is pending approval.</p>
          </div>`;
    statusText = 'PENDING APPROVAL';
  }

  return `
        <div class="max-w-xl mx-auto">
          ${statusBanner}

        <div class="card">
          <div class="card-header">
            <h3 class="card-title">Trading Request Details</h3>
          </div>
          <div class="card-body p-6">
            <div class="confirmation-grid">
              <div class="confirmation-item">
                <span class="confirmation-label">Request ID:</span>
                <span class="confirmation-value text-monospace">${getDisplayId(request)}</span>
              </div>
              <div class="confirmation-item">
                <span class="confirmation-label">Stock:</span>
                <span>${request.stock_name} (<strong>${request.ticker}</strong>)</span>
              </div>
              <div class="confirmation-item">
                <span class="confirmation-label">Action:</span>
                <span class="${request.trading_type === 'buy' ? 'confirmation-status-buy' : 'confirmation-status-sell'}">${request.trading_type}</span>
              </div>
              <div class="confirmation-item">
                <span class="confirmation-label">Shares:</span>
                <span class="confirmation-value">${parseInt(request.shares).toLocaleString()}</span>
              </div>
              <div class="confirmation-item">
                <span class="confirmation-label">Estimated Total:</span>
                <span class="confirmation-value">$${(request.total_value_usd || request.total_value || 0).toLocaleString('en-US', {minimumFractionDigits: 2})} USD</span>
              </div>
              <div class="confirmation-item">
                <span class="confirmation-label">Status:</span>
                <span class="${request.status === 'approved' ? 'status-approved' : request.status === 'rejected' ? 'status-rejected' : 'status-pending'}">${statusText}</span>
              </div>
              ${request.rejection_reason ? `
              <div class="alert-danger">
                <span class="text-danger">Rejection Reason:</span>
                <p class="mt-1 mb-0 text-danger">${request.rejection_reason}</p>
              </div>` : ''}
            </div>
          </div>
        </div>

        ${request.status === 'rejected' ? `
        <div class="card mt-6">
          <div class="card-header">
            <h3 class="card-title">Request Escalation</h3>
          </div>
          <div class="card-body p-0">
            <div class="p-6 pb-0">
              <p class="mb-4 text-gray-600">
                If you have a valid business reason for this trade, you can escalate this request for admin review.
              </p>
            </div>
            <form method="post" action="/submit-escalation">
              ${csrfInput}
              <input type="hidden" name="requestId" value="${request.uuid}">
              <div class="px-6 pb-4">
                <textarea name="escalation_reason" required rows="4"
                         placeholder="Please provide a detailed business justification for this trade..."
                         class="form-control resize-vertical"></textarea>
              </div>
              <div class="p-6 pt-0 text-center">
                <button type="submit" class="btn btn-primary">
                  Submit Escalation Request
                </button>
              </div>
            </form>
          </div>
        </div>` : ''}

        <div class="mt-6 text-center">
          <div class="btn-group btn-group-mobile">
            <a href="/employee-dashboard" class="btn btn-primary text-decoration-none p-3 w-full-mobile focus-ring">
              ← Back to Dashboard
            </a>
            <a href="/employee-history" class="btn btn-secondary text-decoration-none p-3 w-full-mobile focus-ring">
              View Request History
            </a>
          </div>
        </div>
        </div>
      `;
}

module.exports = renderResult;
