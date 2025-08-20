const TradingRequestService = require('../services/TradingRequestService');
const CurrencyService = require('../services/CurrencyService');
const TradingRequest = require('../models/TradingRequest');
const { catchAsync } = require('../middleware/errorHandler');
const { renderEmployeePage, generateNotificationBanner, renderCard } = require('../utils/templates');
const { getDisplayId } = require('../utils/formatters');

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

    try {
      // Validate ticker or ISIN and get info WITHOUT creating request yet
      const validation = await TradingRequestService.validateTickerOrISIN(ticker);
      if (!validation.isValid) {
        const instrumentType = validation.instrument_type === 'bond' ? 'ISIN' : 'ticker symbol';
        const examples = validation.instrument_type === 'bond' 
          ? 'Use 12-character ISIN format like US1234567890 or GB0987654321'
          : 'Use formats like AAPL (US), 0700.HK (Hong Kong), BARC.L (UK), or SAP.DE (Europe)';
        const errorMessage = `Invalid ${instrumentType} "${ticker.toUpperCase()}". ${validation.error}. Please check the ${instrumentType} and try again. ${examples}.`;
        throw new Error(errorMessage);
      }

      // Check if instrument is restricted (works for both stocks and bonds)
      const isRestricted = await TradingRequestService.checkRestrictedStatus(ticker.toUpperCase());

      // Calculate values for display
      const instrumentCurrency = validation.currency || 'USD';
      const instrumentType = validation.instrument_type;
      // For bonds, assume unit price = $1 USD (face value). For stocks, use market price
      const sharePrice = instrumentType === 'bond' ? 1 : (validation.regularMarketPrice || validation.price || 100);
      const estimatedValue = sharePrice * parseInt(shares);
      const instrumentName = validation.longName || validation.name || `${instrumentType.charAt(0).toUpperCase() + instrumentType.slice(1)} ${ticker.toUpperCase()}`;
      
      // Convert to USD for display
      let sharePriceUSD = sharePrice;
      let estimatedValueUSD = estimatedValue;
      let exchangeRate = 1;
      
      if (instrumentCurrency !== 'USD') {
        const conversion = await CurrencyService.convertToUSD(sharePrice, instrumentCurrency);
        sharePriceUSD = conversion.usdAmount;
        estimatedValueUSD = sharePriceUSD * parseInt(shares);
        exchangeRate = conversion.exchangeRate;
      }

      // Only show warning for restricted instruments, no message for non-restricted
      let expectedOutcome = '';
      if (isRestricted) {
        const instrumentTypeDisplay = instrumentType === 'bond' ? 'Bond' : 'Stock';
        expectedOutcome = `
          <div class="bg-warning border rounded p-4 mb-4">
            <h4 class="m-0 text-warning">⚠️ Restricted ${instrumentTypeDisplay} Warning</h4>
            <p class="mt-2 m-0 text-warning">${ticker.toUpperCase()} is on the restricted trading list. This request will be <strong>automatically rejected</strong> upon submission, but you will have the option to escalate with a business justification.</p>
          </div>`;
      }

      // Render preview page with compliance declaration
      const previewContent = `
        <div class="max-w-lg mx-auto">
          <h2 class="text-center mb-6 text-2xl heading">Review Trading Request</h2>
          
          ${expectedOutcome}

          <div class="card">
            <div class="card-header">
              <h3 class="card-title heading">Trading Request Details</h3>
            </div>
            <div class="card-body p-6">
              <div class="grid gap-4">
                <div class="d-flex justify-content-between p-3 bg-muted rounded">
                  <span class="font-weight-600">${instrumentType === 'bond' ? 'Bond:' : 'Stock:'}</span>
                  <span>${instrumentName} (<strong>${ticker.toUpperCase()}</strong>)</span>
                </div>
                ${instrumentType === 'bond' ? `
                <div class="d-flex justify-content-between p-3 bg-muted rounded">
                  <span class="font-weight-600">Instrument Type:</span>
                  <span class="badge badge-info">Bond (ISIN)</span>
                </div>` : ''}
                <div class="d-flex justify-content-between p-3 bg-muted rounded">
                  <span class="font-weight-600">Action:</span>
                  <span class="text-uppercase font-weight-600 ${trading_type === 'buy' ? 'text-success' : 'text-danger'}">${trading_type}</span>
                </div>
                <div class="d-flex justify-content-between p-3 bg-muted rounded">
                  <span class="font-weight-600">${instrumentType === 'bond' ? 'Units:' : 'Shares:'}</span>
                  <span class="font-weight-600">${parseInt(shares).toLocaleString()}</span>
                </div>
                <div class="d-flex justify-content-between p-3 bg-muted rounded">
                  <span class="font-weight-600">${instrumentType === 'bond' ? 'Unit Price:' : 'Current Price:'}</span>
                  <span>
                    ${instrumentCurrency === 'USD' 
                      ? `$${sharePrice.toFixed(2)} USD`
                      : `${sharePrice.toFixed(2)} ${instrumentCurrency} (~$${sharePriceUSD.toFixed(2)} USD)`
                    }
                  </span>
                </div>
                <div class="d-flex justify-content-between p-3 bg-muted rounded">
                  <span class="font-weight-600">Estimated Total:</span>
                  <span class="font-weight-600">
                    ${instrumentCurrency === 'USD' 
                      ? `$${estimatedValue.toLocaleString('en-US', {minimumFractionDigits: 2})} USD`
                      : `${estimatedValue.toLocaleString('en-US', {minimumFractionDigits: 2})} ${instrumentCurrency} (~$${estimatedValueUSD.toLocaleString('en-US', {minimumFractionDigits: 2})} USD)`
                    }
                  </span>
                </div>${instrumentCurrency !== 'USD' ? `
                <div class="d-flex justify-content-between p-3 rounded" style="background: #e7f3ff; border: 1px solid #b3d9ff;">
                  <span class="font-weight-600">Exchange Rate:</span>
                  <span>1 ${instrumentCurrency} = $${exchangeRate.toFixed(4)} USD</span>
                </div>` : ''}
              </div>
            </div>
          </div>

          <div class="card mt-6">
            <div class="card-header">
              <h3 class="card-title heading">⚖️ Compliance Declaration</h3>
            </div>
            <div class="card-body p-6">
              <form method="post" action="/submit-trade">
                ${req.csrfInput()}
                <input type="hidden" name="ticker" value="${ticker}">
                <input type="hidden" name="shares" value="${shares}">
                <input type="hidden" name="trading_type" value="${trading_type}">
                
                <div class="mb-4">
                  <label class="d-flex align-items-start gap-2 cursor-pointer">
                    <input type="checkbox" name="compliance_declaration" value="confirmed" required 
                           style="margin-top: 5px; width: 20px; height: 20px;">
                    <span style="flex: 1; line-height: 1.6;">
                      <strong>Declaration:</strong><br><br>
                      I have read the Company's Personal Dealing Policy and believe that the above transaction(s) comply with its requirements. I declare that: (i) I will not buy or sell the investment(s) listed above on a day in which the Company has a pending "buy" or "sell" order in the same investment(s) until that order is executed or withdrawn; (ii) I will not buy or sell the investment(s) listed above within one trading day before (where I am aware of a forthcoming client transaction) or after trading in those investment(s) on behalf of a client unless the client order(s) have been fully executed and any conflicts of interest have been removed; (iii) I will not buy or sell the investment(s) listed above within one trading day before (where I am aware of a forthcoming recommendation) or after a recommendation on those investment(s) is made or proposed by the Company unless the client order(s) have been fully executed and any conflicts of interest have been removed; and (iv) the requested investment(s) will not result in a misuse of inside information or in any conflict of interest or impropriety with regards to any client.<br><br>
                      
                      For a trade request for market orders, please note that permission is effective only on the trading day you receive approval.<br><br>
                      
                      For a trade request for limit price orders, please note that permission is effective for five (5) trading days including the trading day you receive approval.<br><br>
                      
                      Relevant Persons must hold all personal investments for at least 30 calendar days as required pursuant to the FMCC (SFC).
                    </span>
                  </label>
                </div>

                <div class="text-center">
                  <div class="btn-group btn-group-mobile">
                    <a href="/employee-dashboard" class="btn btn-secondary text-decoration-none w-full-mobile">
                      Cancel
                    </a>
                    <button type="submit" class="btn btn-primary w-full-mobile">
                      Submit Trading Request
                    </button>
                  </div>
                </div>
              </form>
            </div>
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
   * Submit a trading request after compliance confirmation
   */
  submitTrade = catchAsync(async (req, res) => {
    const { ticker, shares, trading_type, compliance_declaration } = req.body;
    
    // Check authentication
    if (!req.session.employee || !req.session.employee.email) {
      return res.redirect('/?error=authentication_required');
    }

    // Verify compliance declaration
    if (compliance_declaration !== 'confirmed') {
      return res.redirect(`/employee-dashboard?error=${encodeURIComponent('Compliance declaration is required')}`);
    }

    const employeeEmail = req.session.employee.email;
    const ipAddress = req.ip;

    try {
      // Now create the actual trading request
      const { request, tickerInfo, isRestricted } = await TradingRequestService.createTradingRequest(
        { ticker, shares, trading_type },
        employeeEmail,
        ipAddress
      );

      // Show appropriate result page based on status
      if (request.status === 'approved') {
        res.redirect(`/trade-result/${request.uuid}?status=approved`);
      } else if (request.status === 'rejected') {
        res.redirect(`/trade-result/${request.uuid}?status=rejected`);
      } else {
        res.redirect(`/trade-result/${request.uuid}?status=pending`);
      }
      
    } catch (error) {
      const errorMsg = error.message || 'Unable to process trading request';
      return res.redirect(`/employee-dashboard?error=${encodeURIComponent(errorMsg)}`);
    }
  });

  /**
   * Show trade result page
   */
  showTradeResult = catchAsync(async (req, res) => {
    const requestUuid = req.params.requestId; // Now expects UUID
    const { status } = req.query;
    
    if (!req.session.employee || !req.session.employee.email) {
      return res.redirect('/?error=authentication_required');
    }

    try {
      // Get the request details by UUID
      const request = await TradingRequest.getByUuid(requestUuid);
      if (!request || request.employee_email !== req.session.employee.email) {
        return res.redirect('/employee-history?error=request_not_found');
      }

      let statusBanner = '';
      let statusText = '';
      let statusColor = '';
    
        if (status === 'approved') {
          statusBanner = `
            <div class="alert alert-success text-center">
              <h3 class="m-0">✅ Request Approved</h3>
            </div>`;
          statusText = 'APPROVED';
          statusColor = '#28a745';
      } else if (status === 'rejected') {
        statusBanner = `
          <div class="alert alert-error text-center">
            <h3 class="m-0">❌ Request Rejected</h3>
            <p class="mt-2 m-0"><strong>You can escalate this request with a business justification below.</strong></p>
          </div>`;
        statusText = 'REJECTED';
        statusColor = '#dc3545';
      } else {
        statusBanner = `
          <div class="alert alert-info text-center">
            <h3 class="m-0">✅ Request Created Successfully</h3>
            <p class="mt-2 m-0 text-muted">Your trading request has been submitted and is pending approval.</p>
          </div>`;
        statusText = 'PENDING APPROVAL';
        statusColor = '#ffc107';
      }

      const resultContent = `
        <div class="max-w-xl mx-auto">
          ${statusBanner}

        <div class="card">
          <div class="card-header">
            <h3 class="card-title heading">Trading Request Details</h3>
          </div>
          <div class="card-body p-6">
            <div style="display: grid; gap: var(--spacing-4);">
              <div style="display: flex; justify-content: space-between; padding: var(--spacing-3); background: var(--gs-neutral-100); border-radius: var(--radius);">
                <span style="font-weight: 600;">Request ID:</span>
                <span style="font-family: monospace;">${getDisplayId(request)}</span>
              </div>
              <div style="display: flex; justify-content: space-between; padding: var(--spacing-3); background: var(--gs-neutral-100); border-radius: var(--radius);">
                <span style="font-weight: 600;">Stock:</span>
                <span>${request.stock_name} (<strong>${request.ticker}</strong>)</span>
              </div>
              <div style="display: flex; justify-content: space-between; padding: var(--spacing-3); background: var(--gs-neutral-100); border-radius: var(--radius);">
                <span style="font-weight: 600;">Action:</span>
                <span style="text-transform: uppercase; font-weight: 600; color: ${request.trading_type === 'buy' ? '#28a745' : '#dc3545'};">${request.trading_type}</span>
              </div>
              <div style="display: flex; justify-content: space-between; padding: var(--spacing-3); background: var(--gs-neutral-100); border-radius: var(--radius);">
                <span style="font-weight: 600;">Shares:</span>
                <span style="font-weight: 600;">${parseInt(request.shares).toLocaleString()}</span>
              </div>
              <div style="display: flex; justify-content: space-between; padding: var(--spacing-3); background: var(--gs-neutral-100); border-radius: var(--radius);">
                <span style="font-weight: 600;">Estimated Total:</span>
                <span style="font-weight: 600;">$${(request.total_value_usd || request.total_value || 0).toLocaleString('en-US', {minimumFractionDigits: 2})} USD</span>
              </div>
              <div style="display: flex; justify-content: space-between; padding: var(--spacing-3); background: var(--gs-neutral-100); border-radius: var(--radius);">
                <span style="font-weight: 600;">Status:</span>
                <span style="color: ${statusColor}; font-weight: 600;">${statusText}</span>
              </div>
              ${request.rejection_reason ? `
              <div style="padding: var(--spacing-3); background: #f8d7da; border: 1px solid #f5c6cb; border-radius: var(--radius);">
                <span style="font-weight: 600; color: #721c24;">Rejection Reason:</span>
                <p style="margin: var(--spacing-1) 0 0 0; color: #721c24;">${request.rejection_reason}</p>
              </div>` : ''}
            </div>
          </div>
        </div>

        ${request.status === 'rejected' ? `
        <div class="card mt-6">
          <div class="card-header">
            <h3 class="card-title heading">🚀 Request Escalation</h3>
          </div>
          <div class="card-body p-0">
            <div class="p-6 pb-0">
              <p style="margin-bottom: var(--spacing-4); color: var(--gs-neutral-700);">
                If you have a valid business reason for this trade, you can escalate this request for admin review.
              </p>
            </div>
            <form method="post" action="/submit-escalation">
              ${req.csrfInput()}
              <input type="hidden" name="requestId" value="${request.uuid}">
              <div style="padding: 0 var(--spacing-6) var(--spacing-4) var(--spacing-6);">
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

        const html = renderEmployeePage('Trading Request Result', resultContent, req.session.employee.name, req.session.employee.email);
        res.send(html);
    } catch (error) {
      console.error('Error in showTradeResult:', error);
      return res.redirect(`/employee-history?error=${encodeURIComponent('Unable to load trade result')}`);
    }
  });

  /**
   * Escalate a trading request
   */
  escalateRequest = catchAsync(async (req, res) => {
    const { escalation_reason } = req.body;
    const requestUuid = req.body.requestId || req.params.requestId; // Now UUID
    
    if (!req.session.employee || !req.session.employee.email) {
      return res.redirect('/?error=authentication_required');
    }

    const employeeEmail = req.session.employee.email;
    const ipAddress = req.ip;

    await TradingRequestService.escalateRequest(requestUuid, escalation_reason, employeeEmail, ipAddress);
    
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