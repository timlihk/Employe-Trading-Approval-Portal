// Template: Trade preview/confirmation page
// Receives a plain data object, returns an HTML string

const { escapeHtml } = require('../../utils/formatters');

/**
 * @param {object} data
 * @param {string} data.ticker
 * @param {string} data.shares
 * @param {string} data.trading_type
 * @param {string} data.instrumentType - 'bond' or 'stock'
 * @param {string} data.instrumentName
 * @param {string} data.instrumentCurrency
 * @param {number} data.sharePrice
 * @param {number} data.sharePriceUSD
 * @param {number} data.estimatedValue
 * @param {number} data.estimatedValueUSD
 * @param {number} data.exchangeRate
 * @param {boolean} data.isRestricted
 * @param {string} data.csrfInput - pre-rendered CSRF hidden input HTML
 * @returns {string} HTML string
 */
function renderPreview(data) {
  const {
    ticker,
    shares,
    trading_type,
    instrumentType,
    instrumentName,
    instrumentCurrency,
    sharePrice,
    sharePriceUSD,
    estimatedValue,
    estimatedValueUSD,
    exchangeRate,
    isRestricted,
    csrfInput,
  } = data;

  let expectedOutcome = '';
  if (isRestricted) {
    const instrumentTypeDisplay = instrumentType === 'bond' ? 'Bond' : 'Stock';
    expectedOutcome = `
          <div class="bg-warning border rounded p-4 mb-4">
            <h4 class="m-0 text-warning">Restricted ${instrumentTypeDisplay} Warning</h4>
            <p class="mt-2 m-0 text-warning">${escapeHtml(ticker.toUpperCase())} is on the restricted trading list. This request will be <strong>automatically rejected</strong> upon submission, but you will have the option to escalate with a business justification.</p>
          </div>`;
  }

  return `
        <div class="max-w-lg mx-auto">
          <h2 class="text-center mb-6 heading">Review Trading Request</h2>

          ${expectedOutcome}

          <div class="card">
            <div class="card-header">
              <h3 class="card-title">Trading Request Details</h3>
            </div>
            <div class="card-body p-6">
              <div class="grid gap-4">
                <div class="d-flex justify-content-between p-3 bg-muted rounded">
                  <span class="font-weight-600">${instrumentType === 'bond' ? 'Bond:' : 'Stock:'}</span>
                  <span>${escapeHtml(instrumentName)} (<strong>${escapeHtml(ticker.toUpperCase())}</strong>)</span>
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
                      : `${sharePrice.toFixed(2)} ${escapeHtml(instrumentCurrency)} (~$${sharePriceUSD.toFixed(2)} USD)`
                    }
                  </span>
                </div>
                <div class="d-flex justify-content-between p-3 bg-muted rounded">
                  <span class="font-weight-600">Estimated Total:</span>
                  <span class="font-weight-600">
                    ${instrumentCurrency === 'USD'
                      ? `$${estimatedValue.toLocaleString('en-US', {minimumFractionDigits: 2})} USD`
                      : `${estimatedValue.toLocaleString('en-US', {minimumFractionDigits: 2})} ${escapeHtml(instrumentCurrency)} (~$${estimatedValueUSD.toLocaleString('en-US', {minimumFractionDigits: 2})} USD)`
                    }
                  </span>
                </div>${instrumentCurrency !== 'USD' ? `
                <div class="d-flex justify-content-between p-3 rounded alert-info">
                  <span class="font-weight-600">Exchange Rate:</span>
                  <span>1 ${escapeHtml(instrumentCurrency)} = $${exchangeRate.toFixed(4)} USD</span>
                </div>` : ''}
              </div>
            </div>
          </div>

          <div class="card mt-6">
            <div class="card-header">
              <h3 class="card-title">Compliance Declaration</h3>
            </div>
            <div class="card-body p-6">
              <form method="post" action="/submit-trade">
                ${csrfInput}
                <input type="hidden" name="ticker" value="${escapeHtml(ticker)}">
                <input type="hidden" name="shares" value="${escapeHtml(shares)}">
                <input type="hidden" name="trading_type" value="${escapeHtml(trading_type)}">

                <div class="mb-4">
                  <label class="d-flex align-items-start gap-2 cursor-pointer">
                    <input type="checkbox" name="compliance_declaration" value="confirmed" required
                           class="icon-sm">
                    <span class="flex-1 line-height-1-6">
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
}

module.exports = renderPreview;
