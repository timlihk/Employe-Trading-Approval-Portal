// Escalation form template

const { formatHongKongTime } = require('../shared/formatters');
const { getDisplayId, escapeHtml } = require('../../utils/formatters');

/**
 * @param {object} data
 * @param {string} data.csrfInput          - hidden CSRF input HTML
 * @param {object} data.request            - the trading request being escalated
 * @param {string} data.request.uuid
 * @param {string} data.request.stock_name
 * @param {string} data.request.ticker
 * @param {string} data.request.instrument_type
 * @param {string} data.request.trading_type
 * @param {number} data.request.shares
 * @param {number} data.request.total_value_usd
 * @param {number} data.request.total_value
 * @param {string} data.request.created_at
 * @returns {string} HTML
 */
function renderEscalation(data) {
  const { csrfInput, request } = data;

  return `
    <div class="card">
      <div class="card-header">
        <h3 class="card-title">Escalate Trading Request #${getDisplayId(request)}</h3>
      </div>
      <div class="card-body">
        <div class="bg-muted p-4 border-radius mb-6">
          <h4 class="m-0 mb-3">Request Details:</h4>
          <div class="grid gap-2">
            <div><strong>${request.instrument_type === 'bond' ? 'Bond' : 'Stock'}:</strong> ${escapeHtml(request.stock_name)} (${escapeHtml(request.ticker)})</div>
            <div><strong>Type:</strong> ${request.trading_type.toUpperCase()}</div>
            <div><strong>${request.instrument_type === 'bond' ? 'Units' : 'Shares'}:</strong> ${parseInt(request.shares).toLocaleString()}</div>
            <div><strong>Estimated Value:</strong> $${parseFloat(request.total_value_usd || request.total_value || 0).toLocaleString('en-US', {minimumFractionDigits: 2})}</div>
            <div><strong>Submitted:</strong> ${formatHongKongTime(new Date(request.created_at))}</div>
          </div>
        </div>

        <form method="post" action="/submit-escalation">
          ${csrfInput}
          <input type="hidden" name="requestId" value="${request.uuid}">

          <div class="mb-4">
            <label class="form-label">
              Escalation Reason: <span class="text-danger">*</span>
            </label>
            <textarea name="escalation_reason" required rows="5"
                      placeholder="Please explain why you are escalating this request. Provide any additional context or urgency that administrators should be aware of."
                      class="form-control resize-vertical"></textarea>
            <small class="form-text">
              Escalating a request will notify administrators for priority review. Please provide a clear reason.
            </small>
          </div>

          <div class="text-right mt-6">
            <a href="/employee-history" class="btn btn-secondary text-decoration-none mr-3">
              Cancel
            </a>
            <button type="submit" class="btn btn-warning">
              Escalate Request
            </button>
          </div>
        </form>
      </div>
    </div>
  `;
}

module.exports = { renderEscalation };
