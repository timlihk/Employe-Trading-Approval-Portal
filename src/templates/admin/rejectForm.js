const { getDisplayId } = require('../../utils/formatters');

/**
 * Render rejection form for a trading request
 * @param {Object} data
 * @param {string} data.requestUuid - UUID of the request
 * @param {Object} data.request - the trading request object
 * @param {string} data.csrfInput - CSRF hidden input tag
 * @returns {string} HTML content
 */
function rejectFormTemplate({ requestUuid, request, csrfInput }) {
  return `
      <div class="max-w-lg mx-auto">
        <div class="card">
          <div class="card-header">
            <h3 class="card-title">Reject Trading Request #${getDisplayId({uuid: requestUuid})}</h3>
          </div>
          <div class="card-body">
            <div class="bg-muted p-4 rounded mb-4">
              <h4>Request Details:</h4>
              <p><strong>Employee:</strong> ${request.employee_email}</p>
              <p><strong>Stock:</strong> ${request.stock_name} (${request.ticker})</p>
              <p><strong>Action:</strong> ${request.trading_type.toUpperCase()}</p>
              <p><strong>Shares:</strong> ${parseInt(request.shares).toLocaleString()}</p>
              <p><strong>Estimated Value:</strong> $${parseFloat(request.total_value_usd || request.total_value || 0).toLocaleString('en-US', {minimumFractionDigits: 2})}</p>
            </div>

            <form method="post" action="/admin-reject-request">
            ${csrfInput}
              <input type="hidden" name="requestId" value="${requestUuid}">
              <div class="mb-4">
                <label class="form-label">Rejection Reason (Optional for escalated requests):</label>
                <textarea name="rejection_reason" ${request.escalated ? '' : 'required'} rows="4"
                         placeholder="${request.escalated ? '(Optional) Provide a reason for rejection...' : 'Please provide a detailed reason for rejection...'}"
                         class="form-control resize-vertical"></textarea>
              </div>
              <div class="text-center d-flex gap-3 justify-center">
                <a href="/admin-requests" class="btn btn-secondary text-decoration-none p-3">
                  Cancel
                </a>
                <button type="submit" class="btn btn-danger p-3">
                  Reject Request
                </button>
              </div>
            </form>
          </div>
        </div>
      </div>
    `;
}

module.exports = { rejectFormTemplate };
