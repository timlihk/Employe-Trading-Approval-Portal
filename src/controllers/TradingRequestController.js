const TradingRequestService = require('../services/TradingRequestService');
const { catchAsync } = require('../middleware/errorHandler');
const { renderEmployeePage, generateNotificationBanner, renderCard } = require('../utils/templates');

class TradingRequestController {
  /**
   * Preview a trading request
   */
  previewTrade = catchAsync(async (req, res) => {
    const { ticker, shares, trading_type } = req.body;
    
    // Check authentication (employee must be logged in)
    if (!req.session.employee || !req.session.employee.email) {
      return res.redirect('/?error=authentication_required');
    }

    const employeeEmail = req.session.employee.email;
    const ipAddress = req.ip;

    try {
      // Create trading request and get ticker info
      const { request, tickerInfo } = await TradingRequestService.createTradingRequest(
        { ticker, shares, trading_type },
        employeeEmail,
        ipAddress
      );

      // Calculate values for display
      const stockCurrency = tickerInfo.currency || 'USD';
      const localTotalValue = request.total_value || request.estimated_value || 0;
      const usdTotalValue = request.total_value_usd || localTotalValue;

      // Render preview page
      const previewContent = `
        <div style="max-width: 600px; margin: 0 auto;">
          <div style="background: #e7f3ff; border: 1px solid #b3d9ff; padding: var(--spacing-4); border-radius: var(--radius); margin-bottom: var(--spacing-6); text-align: center;">
            <h3 style="margin: 0; color: var(--gs-dark-blue);">✅ Request Created Successfully</h3>
            <p style="margin: var(--spacing-2) 0 0 0; color: var(--gs-neutral-700);">Your trading request has been submitted and is pending approval.</p>
          </div>

          <div class="card">
            <div class="card-header">
              <h3 class="card-title">Trading Request Details</h3>
            </div>
            <div class="card-body">
              <div style="display: grid; gap: var(--spacing-4);">
                <div style="display: flex; justify-content: space-between; padding: var(--spacing-3); background: var(--gs-neutral-100); border-radius: var(--radius);">
                  <span style="font-weight: 600;">Request ID:</span>
                  <span style="font-family: monospace;">#${request.id}</span>
                </div>
                <div style="display: flex; justify-content: space-between; padding: var(--spacing-3); background: var(--gs-neutral-100); border-radius: var(--radius);">
                  <span style="font-weight: 600;">Stock:</span>
                  <span>${tickerInfo.longName} (<strong>${ticker.toUpperCase()}</strong>)</span>
                </div>
                <div style="display: flex; justify-content: space-between; padding: var(--spacing-3); background: var(--gs-neutral-100); border-radius: var(--radius);">
                  <span style="font-weight: 600;">Action:</span>
                  <span style="text-transform: uppercase; font-weight: 600; color: ${trading_type === 'buy' ? '#28a745' : '#dc3545'};">${trading_type}</span>
                </div>
                <div style="display: flex; justify-content: space-between; padding: var(--spacing-3); background: var(--gs-neutral-100); border-radius: var(--radius);">
                  <span style="font-weight: 600;">Shares:</span>
                  <span style="font-weight: 600;">${parseInt(shares).toLocaleString()}</span>
                </div>
                <div style="display: flex; justify-content: space-between; padding: var(--spacing-3); background: var(--gs-neutral-100); border-radius: var(--radius);">
                  <span style="font-weight: 600;">Current Price:</span>
                  <span>$${(tickerInfo.regularMarketPrice || 0).toFixed(2)} USD</span>
                </div>
                <div style="display: flex; justify-content: space-between; padding: var(--spacing-3); background: var(--gs-neutral-100); border-radius: var(--radius);">
                  <span style="font-weight: 600;">Estimated Total:</span>
                  <span style="font-weight: 600;">$${usdTotalValue.toLocaleString('en-US', {minimumFractionDigits: 2})} USD${stockCurrency !== 'USD' ? ` (${localTotalValue.toFixed(2)} ${stockCurrency})` : ''}</span>
                </div>
                <div style="display: flex; justify-content: space-between; padding: var(--spacing-3); background: var(--gs-neutral-100); border-radius: var(--radius);">
                  <span style="font-weight: 600;">Status:</span>
                  <span style="color: #ffc107; font-weight: 600;">PENDING APPROVAL</span>
                </div>
              </div>
            </div>
          </div>

          <div style="margin-top: var(--spacing-6); text-align: center;">
            <a href="/employee-dashboard" class="btn btn-primary" style="padding: 15px 30px; font-size: 16px; text-decoration: none; margin-right: 20px;">
              ← Back to Dashboard
            </a>
            <a href="/employee-history" class="btn btn-secondary" style="padding: 15px 30px; font-size: 16px; text-decoration: none;">
              View Request History
            </a>
          </div>
        </div>
      `;

      const html = renderEmployeePage('Trading Request Preview', previewContent, req.session.employee.name, req.session.employee.email);
      res.send(html);

    } catch (error) {
      // Redirect back to dashboard with error
      const errorMsg = error.message || 'Unable to process trading request';
      return res.redirect(`/employee-dashboard?error=${encodeURIComponent(errorMsg)}&ticker=${encodeURIComponent(ticker)}&shares=${encodeURIComponent(shares)}&trading_type=${encodeURIComponent(trading_type)}`);
    }
  });

  /**
   * Escalate a trading request
   */
  escalateRequest = catchAsync(async (req, res) => {
    const { escalation_reason } = req.body;
    const requestId = parseInt(req.body.requestId || req.params.requestId);
    
    if (!req.session.employee || !req.session.employee.email) {
      return res.redirect('/?error=authentication_required');
    }

    const employeeEmail = req.session.employee.email;
    const ipAddress = req.ip;

    await TradingRequestService.escalateRequest(requestId, escalation_reason, employeeEmail, ipAddress);
    
    res.redirect('/employee-history?message=escalation_submitted');
  });

}

// Helper function - should be moved to utils
function formatHongKongTime(date = new Date(), includeTime = false) {
  let utcDate;
  
  if (typeof date === 'string') {
    utcDate = new Date(date + 'Z');
  } else {
    utcDate = date;
  }
  
  const hkTime = new Date(utcDate.getTime() + (8 * 60 * 60 * 1000));
  
  if (includeTime) {
    const day = hkTime.getUTCDate().toString().padStart(2, '0');
    const month = (hkTime.getUTCMonth() + 1).toString().padStart(2, '0');
    const year = hkTime.getUTCFullYear();
    const hour = hkTime.getUTCHours().toString().padStart(2, '0');
    const minute = hkTime.getUTCMinutes().toString().padStart(2, '0');
    const second = hkTime.getUTCSeconds().toString().padStart(2, '0');
    
    return `${day}/${month}/${year}, ${hour}:${minute}:${second}`;
  } else {
    const day = hkTime.getUTCDate().toString().padStart(2, '0');
    const month = (hkTime.getUTCMonth() + 1).toString().padStart(2, '0');
    const year = hkTime.getUTCFullYear();
    
    return `${day}/${month}/${year}`;
  }
}

module.exports = new TradingRequestController();