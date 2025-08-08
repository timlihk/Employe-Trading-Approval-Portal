const TradingRequestService = require('../services/TradingRequestService');
const CurrencyService = require('../services/CurrencyService');
const TradingRequest = require('../models/TradingRequest');
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

    try {
      // Just validate ticker and get info WITHOUT creating request yet
      const tickerValidation = await TradingRequestService.validateTicker(ticker);
      if (!tickerValidation.isValid) {
        const errorMessage = `Invalid ticker symbol "${ticker.toUpperCase()}". ${tickerValidation.error}. Please check the ticker symbol and try again. Use formats like AAPL (US), 0700.HK (Hong Kong), BARC.L (UK), or SAP.DE (Europe).`;
        throw new Error(errorMessage);
      }

      // Check if stock is restricted
      const isRestricted = await TradingRequestService.checkRestrictedStatus(ticker.toUpperCase());

      // Calculate values for display
      const sharePrice = tickerValidation.regularMarketPrice || 0;
      const estimatedValue = sharePrice * parseInt(shares);
      const stockCurrency = tickerValidation.currency || 'USD';
      
      // Convert to USD for display
      let sharePriceUSD = sharePrice;
      let estimatedValueUSD = estimatedValue;
      let exchangeRate = 1;
      
      if (stockCurrency !== 'USD') {
        const conversion = await CurrencyService.convertToUSD(sharePrice, stockCurrency);
        sharePriceUSD = conversion.usdAmount;
        estimatedValueUSD = sharePriceUSD * parseInt(shares);
        exchangeRate = conversion.exchangeRate;
      }

      // Only show warning for restricted stocks, no message for non-restricted
      let expectedOutcome = '';
      if (isRestricted) {
        expectedOutcome = `
          <div style="background: #fff3cd; border: 1px solid #ffeeba; padding: var(--spacing-4); border-radius: var(--radius); margin-bottom: var(--spacing-4);">
            <h4 style="margin: 0; color: #856404;">⚠️ Restricted Stock Warning</h4>
            <p style="margin: var(--spacing-2) 0 0 0; color: #856404;">${ticker.toUpperCase()} is on the restricted trading list. This request will be <strong>automatically rejected</strong> upon submission, but you will have the option to escalate with a business justification.</p>
          </div>`;
      }

      // Render preview page with compliance declaration
      const previewContent = `
        <div style="max-width: 700px; margin: 0 auto;">
          <h2 style="text-align: center; color: var(--gs-dark-blue); margin-bottom: var(--spacing-6);">Review Trading Request</h2>
          
          ${expectedOutcome}

          <div class="card">
            <div class="card-header">
              <h3 class="card-title">Trading Request Details</h3>
            </div>
            <div class="card-body">
              <div style="display: grid; gap: var(--spacing-4);">
                <div style="display: flex; justify-content: space-between; padding: var(--spacing-3); background: var(--gs-neutral-100); border-radius: var(--radius);">
                  <span style="font-weight: 600;">Stock:</span>
                  <span>${tickerValidation.longName} (<strong>${ticker.toUpperCase()}</strong>)</span>
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
                  <span>
                    ${stockCurrency === 'USD' 
                      ? `$${sharePrice.toFixed(2)} USD`
                      : `${sharePrice.toFixed(2)} ${stockCurrency} (~$${sharePriceUSD.toFixed(2)} USD)`
                    }
                  </span>
                </div>
                <div style="display: flex; justify-content: space-between; padding: var(--spacing-3); background: var(--gs-neutral-100); border-radius: var(--radius);">
                  <span style="font-weight: 600;">Estimated Total:</span>
                  <span style="font-weight: 600;">
                    ${stockCurrency === 'USD' 
                      ? `$${estimatedValue.toLocaleString('en-US', {minimumFractionDigits: 2})} USD`
                      : `${estimatedValue.toLocaleString('en-US', {minimumFractionDigits: 2})} ${stockCurrency} (~$${estimatedValueUSD.toLocaleString('en-US', {minimumFractionDigits: 2})} USD)`
                    }
                  </span>
                </div>${stockCurrency !== 'USD' ? `
                <div style="display: flex; justify-content: space-between; padding: var(--spacing-3); background: #e7f3ff; border: 1px solid #b3d9ff; border-radius: var(--radius);">
                  <span style="font-weight: 600;">Exchange Rate:</span>
                  <span>1 ${stockCurrency} = $${exchangeRate.toFixed(4)} USD</span>
                </div>` : ''}
              </div>
            </div>
          </div>

          <div class="card" style="margin-top: var(--spacing-6);">
            <div class="card-header" style="background: var(--gs-danger); color: white;">
              <h3 class="card-title" style="color: white;">⚖️ Compliance Declaration</h3>
            </div>
            <div class="card-body" style="background: #fef5f5;">
              <form method="post" action="/submit-trade">
                ${req.csrfInput()}
                <input type="hidden" name="ticker" value="${ticker}">
                <input type="hidden" name="shares" value="${shares}">
                <input type="hidden" name="trading_type" value="${trading_type}">
                
                <div style="margin-bottom: var(--spacing-4);">
                  <label style="display: flex; align-items: flex-start; gap: var(--spacing-2); cursor: pointer;">
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

                <div style="text-align: center; display: flex; gap: var(--spacing-3); justify-content: center;">
                  <a href="/employee-dashboard" class="btn btn-secondary" style="text-decoration: none; padding: var(--spacing-3) var(--spacing-6);">
                    Cancel
                  </a>
                  <button type="submit" class="btn btn-primary" style="padding: var(--spacing-3) var(--spacing-6);">
                    Submit Trading Request
                  </button>
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
        res.redirect(`/trade-result/${request.id}?status=approved`);
      } else if (request.status === 'rejected') {
        res.redirect(`/trade-result/${request.id}?status=rejected`);
      } else {
        res.redirect(`/trade-result/${request.id}?status=pending`);
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
    const requestId = parseInt(req.params.requestId);
    const { status } = req.query;
    
    if (!req.session.employee || !req.session.employee.email) {
      return res.redirect('/?error=authentication_required');
    }

    try {
      // Get the request details
      const request = await TradingRequest.getById(requestId);
      if (!request || request.employee_email !== req.session.employee.email) {
        return res.redirect('/employee-history?error=request_not_found');
      }

      let statusBanner = '';
      let statusText = '';
      let statusColor = '';
    
        if (status === 'approved') {
          statusBanner = `
            <div style="background: #d4edda; border: 1px solid #c3e6cb; padding: var(--spacing-4); border-radius: var(--radius); margin-bottom: var(--spacing-6); text-align: center;">
              <h3 style="margin: 0; color: #155724;">✅ Request Approved</h3>
            </div>`;
          statusText = 'APPROVED';
          statusColor = '#28a745';
      } else if (status === 'rejected') {
        statusBanner = `
          <div style="background: #f8d7da; border: 1px solid #f5c6cb; padding: var(--spacing-4); border-radius: var(--radius); margin-bottom: var(--spacing-6); text-align: center;">
            <h3 style="margin: 0; color: #721c24;">❌ Request Rejected</h3>
            <p style="margin: var(--spacing-2) 0 0 0; color: #721c24;"><strong>You can escalate this request with a business justification below.</strong></p>
          </div>`;
        statusText = 'REJECTED';
        statusColor = '#dc3545';
      } else {
        statusBanner = `
          <div style="background: #e7f3ff; border: 1px solid #b3d9ff; padding: var(--spacing-4); border-radius: var(--radius); margin-bottom: var(--spacing-6); text-align: center;">
            <h3 style="margin: 0; color: var(--gs-dark-blue);">✅ Request Created Successfully</h3>
            <p style="margin: var(--spacing-2) 0 0 0; color: var(--gs-neutral-700);">Your trading request has been submitted and is pending approval.</p>
          </div>`;
        statusText = 'PENDING APPROVAL';
        statusColor = '#ffc107';
      }

      const resultContent = `
        <div style="max-width: 600px; margin: 0 auto;">
          ${statusBanner}

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
        <div class="card" style="margin-top: var(--spacing-6);">
          <div class="card-header">
            <h3 class="card-title">🚀 Request Escalation</h3>
          </div>
          <div class="card-body">
            <p style="margin-bottom: var(--spacing-4); color: var(--gs-neutral-700);">
              If you have a valid business reason for this trade, you can escalate this request for admin review.
            </p>
            <form method="post" action="/submit-escalation">
              ${req.csrfInput()}
              <input type="hidden" name="requestId" value="${request.id}">
              <div style="margin-bottom: var(--spacing-4);">
                <label style="display: block; margin-bottom: var(--spacing-2); font-weight: 600;">Business Justification:</label>
                <textarea name="escalation_reason" required rows="4" 
                         placeholder="Please provide a detailed business justification for this trade..." 
                         style="width: 100%; padding: var(--spacing-3); border: 1px solid var(--gs-neutral-300); border-radius: var(--radius); font-family: inherit; resize: vertical;"></textarea>
              </div>
              <div style="text-align: center;">
                <button type="submit" class="btn btn-primary" style="padding: var(--spacing-3) var(--spacing-6);">
                  Submit Escalation Request
                </button>
              </div>
            </form>
          </div>
        </div>` : ''}

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