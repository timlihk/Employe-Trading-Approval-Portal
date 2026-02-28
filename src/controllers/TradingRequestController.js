const TradingRequestService = require('../services/TradingRequestService');
const CurrencyService = require('../services/CurrencyService');
const TradingRequest = require('../models/TradingRequest');
const { catchAsync } = require('../middleware/errorHandler');
const { renderEmployeePage } = require('../utils/templates');
const renderPreview = require('../templates/trading/preview');
const renderResult = require('../templates/trading/result');
const { logger } = require('../utils/logger');

class TradingRequestController {
  /**
   * Preview a trading request
   */
  previewTrade = catchAsync(async (req, res) => {
    const { ticker, shares, trading_type } = req.body;

    if (!req.session.employee || !req.session.employee.email) {
      return res.redirect('/?error=authentication_required');
    }

    try {
      const validation = await TradingRequestService.validateTickerOrISIN(ticker);
      if (!validation.isValid) {
        const instrumentType = validation.instrument_type === 'bond' ? 'ISIN' : 'ticker symbol';
        const examples = validation.instrument_type === 'bond'
          ? 'Use 12-character ISIN format like US1234567890 or GB0987654321'
          : 'Use formats like AAPL (US), 0700.HK (Hong Kong), BARC.L (UK), or SAP.DE (Europe)';
        const errorMessage = `Invalid ${instrumentType} "${ticker.toUpperCase()}". ${validation.error}. Please check the ${instrumentType} and try again. ${examples}.`;
        throw new Error(errorMessage);
      }

      const isRestricted = await TradingRequestService.checkRestrictedStatus(ticker.toUpperCase());

      const instrumentCurrency = validation.currency || 'USD';
      const instrumentType = validation.instrument_type;
      const sharePrice = instrumentType === 'bond' ? 1 : (validation.regularMarketPrice || validation.price || 100);
      const estimatedValue = sharePrice * parseInt(shares);
      const instrumentName = validation.longName || validation.name || `${instrumentType.charAt(0).toUpperCase() + instrumentType.slice(1)} ${ticker.toUpperCase()}`;

      let sharePriceUSD = sharePrice;
      let estimatedValueUSD = estimatedValue;
      let exchangeRate = 1;

      if (instrumentCurrency !== 'USD') {
        const conversion = await CurrencyService.convertToUSD(sharePrice, instrumentCurrency);
        sharePriceUSD = conversion.usdAmount;
        estimatedValueUSD = sharePriceUSD * parseInt(shares);
        exchangeRate = conversion.exchangeRate;
      }

      const previewContent = renderPreview({
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
        csrfInput: req.csrfInput(),
      });

      const html = renderEmployeePage('Trading Request Preview', previewContent, req.session.employee.name, req.session.employee.email);
      res.send(html);

    } catch (error) {
      const errorMsg = error.message || 'Unable to process trading request';
      return res.redirect(`/employee-dashboard?error=${encodeURIComponent(errorMsg)}&ticker=${encodeURIComponent(ticker)}&shares=${encodeURIComponent(shares)}&trading_type=${encodeURIComponent(trading_type)}`);
    }
  });

  /**
   * Submit a trading request after compliance confirmation
   */
  submitTrade = catchAsync(async (req, res) => {
    const { ticker, shares, trading_type, compliance_declaration } = req.body;

    if (!req.session.employee || !req.session.employee.email) {
      return res.redirect('/?error=authentication_required');
    }

    if (compliance_declaration !== 'confirmed') {
      return res.redirect(`/employee-dashboard?error=${encodeURIComponent('Compliance declaration is required')}`);
    }

    const employeeEmail = req.session.employee.email;
    const ipAddress = req.ip;

    try {
      const { request } = await TradingRequestService.createTradingRequest(
        { ticker, shares, trading_type },
        employeeEmail,
        ipAddress
      );

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
    const requestUuid = req.params.requestId;
    const { status } = req.query;

    if (!req.session.employee || !req.session.employee.email) {
      return res.redirect('/?error=authentication_required');
    }

    try {
      const request = await TradingRequest.getByUuid(requestUuid);
      if (!request || request.employee_email !== req.session.employee.email) {
        return res.redirect('/employee-history?error=request_not_found');
      }

      const resultContent = renderResult({
        request,
        status,
        csrfInput: req.csrfInput(),
      });

      const html = renderEmployeePage('Trading Request Result', resultContent, req.session.employee.name, req.session.employee.email);
      res.send(html);
    } catch (error) {
      logger.error('Error in showTradeResult', { error: error.message });
      return res.redirect(`/employee-history?error=${encodeURIComponent('Unable to load trade result')}`);
    }
  });

  /**
   * Escalate a trading request
   */
  escalateRequest = catchAsync(async (req, res) => {
    const { escalation_reason } = req.body;
    const requestUuid = req.body.requestId || req.params.requestId;

    if (!req.session.employee || !req.session.employee.email) {
      return res.redirect('/?error=authentication_required');
    }

    const employeeEmail = req.session.employee.email;
    const ipAddress = req.ip;

    await TradingRequestService.escalateRequest(requestUuid, escalation_reason, employeeEmail, ipAddress);

    res.redirect('/employee-history?message=escalation_submitted');
  });

}

module.exports = new TradingRequestController();
