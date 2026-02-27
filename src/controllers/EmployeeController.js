const TradingRequestService = require('../services/TradingRequestService');
const StatementRequestService = require('../services/StatementRequestService');
const StatementRequest = require('../models/StatementRequest');
const BrokerageAccount = require('../models/BrokerageAccount');
const EmployeeProfile = require('../models/EmployeeProfile');
const { catchAsync } = require('../middleware/errorHandler');
const { renderEmployeePage, generateNotificationBanner } = require('../utils/templates');
const { getDisplayId } = require('../utils/formatters');
const { formatHongKongTime } = require('../templates/shared/formatters');

// Template imports
const { renderDashboard } = require('../templates/employee/dashboard');
const { renderBrokerageAccounts } = require('../templates/employee/brokerageAccounts');
const { renderUploadStatement } = require('../templates/employee/uploadStatement');
const { renderHistory } = require('../templates/employee/history');
const { renderEscalation } = require('../templates/employee/escalation');

class EmployeeController {
  /**
   * Get employee dashboard
   */
  getDashboard = catchAsync(async (req, res) => {
    if (!req.session.employee || !req.session.employee.email) {
      return res.redirect('/?error=authentication_required');
    }

    const { error, message, ticker, shares, trading_type } = req.query;
    let banner = '';
    if (error) {
      banner = generateNotificationBanner({ error });
    } else if (message === 'login_success') {
      banner = generateNotificationBanner({ message: 'Welcome! You have been successfully logged in.' });
    }

    const prefilledTicker = ticker ? decodeURIComponent(ticker) : '';
    const prefilledShares = shares ? decodeURIComponent(shares) : '';
    const prefilledType = trading_type ? decodeURIComponent(trading_type) : 'buy';

    const employeeEmail = req.session.employee.email;
    let brokerageAccounts = [];
    let statementRequests = [];
    try {
      brokerageAccounts = await BrokerageAccount.getByEmployee(employeeEmail);
      statementRequests = await StatementRequest.getByEmployee(employeeEmail);
    } catch (err) {
      // Non-critical — dashboard still works without these
    }

    const pendingStatements = statementRequests.filter(r => r.status === 'pending' || r.status === 'overdue');
    const uploadedStatements = statementRequests.filter(r => r.status === 'uploaded').slice(0, 8);

    const content = renderDashboard({
      banner,
      csrfInput: req.csrfInput(),
      prefilledTicker,
      prefilledShares,
      prefilledType,
      brokerageAccounts,
      pendingStatements,
      uploadedStatements,
    });

    res.send(renderEmployeePage('Employee Dashboard', content, req.session.employee.name, req.session.employee.email));
  });

  /**
   * GET /employee-brokerage-accounts
   */
  getBrokerageAccounts = catchAsync(async (req, res) => {
    if (!req.session.employee || !req.session.employee.email) {
      return res.redirect('/?error=authentication_required');
    }

    const banner = generateNotificationBanner(req.query);
    const email = req.session.employee.email;
    const accounts = await BrokerageAccount.getByEmployee(email);

    const isConfirmed = await EmployeeProfile.isConfirmationCurrent(email);
    const isSetupMode = accounts.length === 0;
    const isConfirmMode = accounts.length > 0 && !isConfirmed;

    const editUuid = req.query.edit;
    const editAccount = editUuid ? accounts.find(a => a.uuid === editUuid) : null;

    const content = renderBrokerageAccounts({
      banner,
      csrfInput: req.csrfInput(),
      accounts,
      editAccount,
      isSetupMode,
      isConfirmMode,
    });

    res.send(renderEmployeePage('Brokerage Accounts', content, req.session.employee.name, req.session.employee.email));
  });

  /**
   * POST /employee-add-brokerage
   */
  addBrokerage = catchAsync(async (req, res) => {
    if (!req.session.employee || !req.session.employee.email) {
      return res.redirect('/?error=authentication_required');
    }
    const { firm_name, account_number } = req.body;
    if (!firm_name || !account_number) {
      return res.redirect('/employee-brokerage-accounts?error=' + encodeURIComponent('Firm name and account number are required'));
    }
    const result = await BrokerageAccount.create({
      employee_email: req.session.employee.email,
      firm_name,
      account_number
    });
    if (!result) {
      return res.redirect('/employee-brokerage-accounts?error=' + encodeURIComponent('This account already exists'));
    }
    delete req.session._brokerageCheck;
    res.redirect('/employee-brokerage-accounts?message=' + encodeURIComponent('Brokerage account added'));
  });

  /**
   * POST /employee-edit-brokerage
   */
  editBrokerage = catchAsync(async (req, res) => {
    if (!req.session.employee || !req.session.employee.email) {
      return res.redirect('/?error=authentication_required');
    }
    const { uuid, firm_name, account_number } = req.body;
    if (!uuid || !firm_name || !account_number) {
      return res.redirect('/employee-brokerage-accounts?error=' + encodeURIComponent('All fields are required'));
    }
    await BrokerageAccount.update(uuid, req.session.employee.email, { firm_name, account_number });
    res.redirect('/employee-brokerage-accounts?message=' + encodeURIComponent('Account updated'));
  });

  /**
   * POST /employee-remove-brokerage
   */
  removeBrokerage = catchAsync(async (req, res) => {
    if (!req.session.employee || !req.session.employee.email) {
      return res.redirect('/?error=authentication_required');
    }
    const { uuid } = req.body;
    await BrokerageAccount.delete(uuid, req.session.employee.email);
    delete req.session._brokerageCheck;
    res.redirect('/employee-brokerage-accounts?message=' + encodeURIComponent('Account removed'));
  });

  /**
   * POST /employee-confirm-accounts
   */
  confirmAccounts = catchAsync(async (req, res) => {
    if (!req.session.employee || !req.session.employee.email) {
      return res.redirect('/?error=authentication_required');
    }

    const email = req.session.employee.email;
    const accounts = await BrokerageAccount.getByEmployee(email);
    if (!accounts || accounts.length === 0) {
      return res.redirect('/employee-brokerage-accounts?error=' + encodeURIComponent('Please add at least one brokerage account before confirming'));
    }

    await EmployeeProfile.confirmAccounts(email);
    delete req.session._brokerageCheck;
    res.redirect('/employee-dashboard?message=accounts_confirmed');
  });

  /**
   * GET /employee-upload-statement
   */
  getUploadStatementPage = catchAsync(async (req, res) => {
    if (!req.session.employee || !req.session.employee.email) {
      return res.redirect('/?error=authentication_required');
    }

    const banner = generateNotificationBanner(req.query);
    const employeeEmail = req.session.employee.email;
    const accounts = await BrokerageAccount.getByEmployee(employeeEmail);

    if (accounts.length === 0) {
      return res.redirect('/employee-brokerage-accounts?error=' + encodeURIComponent('Please add a brokerage account before uploading statements'));
    }

    const selectedAccountUuid = req.query.account || '';

    // Build month/year options (last 12 months)
    const now = new Date();
    const periodOptions = [];
    for (let i = 1; i <= 12; i++) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const y = d.getFullYear();
      const m = d.getMonth() + 1;
      const mName = d.toLocaleString('en-US', { month: 'long' });
      periodOptions.push({ value: `${y}-${m}`, label: `${mName} ${y}` });
    }

    const content = renderUploadStatement({
      banner,
      csrfInput: req.csrfInput(),
      accounts,
      selectedAccountUuid,
      periodOptions,
    });

    res.send(renderEmployeePage('Upload Statement', content, req.session.employee.name, req.session.employee.email));
  });

  /**
   * POST /employee-upload-statement
   */
  processStatementUpload = catchAsync(async (req, res) => {
    if (!req.session.employee || !req.session.employee.email) {
      return res.redirect('/?error=authentication_required');
    }

    const file = req.file;
    const { period, account_uuid, notes } = req.body;

    if (!file) {
      return res.redirect('/employee-upload-statement?error=' + encodeURIComponent('Please select a file to upload'));
    }
    if (!period) {
      return res.redirect('/employee-upload-statement?error=' + encodeURIComponent('Please select a statement period'));
    }
    if (!account_uuid) {
      return res.redirect('/employee-upload-statement?error=' + encodeURIComponent('Please select a brokerage account'));
    }

    const [yearStr, monthStr] = period.split('-');
    const year = parseInt(yearStr);
    const month = parseInt(monthStr);
    if (!year || !month || month < 1 || month > 12) {
      return res.redirect('/employee-upload-statement?error=' + encodeURIComponent('Invalid period selected'));
    }

    const account = await BrokerageAccount.findByUuid(account_uuid);
    if (!account || account.employee_email !== req.session.employee.email.toLowerCase()) {
      return res.redirect('/employee-upload-statement?error=' + encodeURIComponent('Invalid brokerage account'));
    }

    const brokerageName = `${account.firm_name} — ${account.account_number}`;
    const employee = {
      email: req.session.employee.email,
      name: req.session.employee.name
    };

    try {
      await StatementRequestService.processEmployeeUpload(employee, file, { year, month }, brokerageName, notes);
      res.redirect('/employee-dashboard?message=' + encodeURIComponent('Statement uploaded successfully'));
    } catch (error) {
      res.redirect('/employee-upload-statement?account=' + account_uuid + '&error=' + encodeURIComponent(error.message));
    }
  });

  /**
   * Get employee history
   */
  getHistory = catchAsync(async (req, res) => {
    const { message, error, start_date, end_date, ticker, trading_type, status, instrument_type, sort_by = 'created_at', sort_order = 'DESC', page = 1, limit = 25 } = req.query;

    if (!req.session.employee || !req.session.employee.email) {
      return res.redirect('/?error=authentication_required');
    }

    const employeeEmail = req.session.employee.email;

    let banner = '';
    if (message === 'escalation_submitted') {
      banner = generateNotificationBanner({ message: 'Your escalation has been submitted successfully and will be reviewed by administrators.' });
    } else if (error) {
      banner = generateNotificationBanner({ error });
    }

    const validatedPage = Math.max(1, parseInt(page) || 1);
    const validatedLimit = Math.min(100, Math.max(1, parseInt(limit) || 25));

    const filters = { page: validatedPage, limit: validatedLimit };
    if (start_date) filters.start_date = start_date;
    if (end_date) filters.end_date = end_date;
    if (ticker) filters.ticker = ticker.toUpperCase();
    if (trading_type) filters.trading_type = trading_type;
    if (status) filters.status = status;
    if (instrument_type) filters.instrument_type = instrument_type;

    const result = await TradingRequestService.getEmployeeRequests(employeeEmail, filters, sort_by, sort_order);

    if (!result || !result.data) {
      console.error('EmployeeController.getHistory: Service returned no data', { result, employeeEmail, filters });
      throw new Error('Unable to fetch trading requests - service returned no data');
    }

    const requests = result.data;
    const pagination = result.pagination;

    const currentSortBy = req.query.sort_by || 'created_at';
    const currentSortOrder = req.query.sort_order || 'DESC';

    const content = renderHistory({
      banner,
      requests,
      pagination,
      filters: { start_date, end_date, ticker, trading_type, status, instrument_type },
      currentSortBy,
      currentSortOrder,
      queryParams: { ...req.query },
      filterCount: Object.keys(filters).length,
    });

    res.send(renderEmployeePage('Request History', content, req.session.employee.name, req.session.employee.email));
  });

  /**
   * Get escalation form
   */
  getEscalationForm = catchAsync(async (req, res) => {
    const requestUuid = req.params.id;

    if (!req.session.employee || !req.session.employee.email) {
      return res.redirect('/?error=authentication_required');
    }

    const employeeEmail = req.session.employee.email;
    const result = await TradingRequestService.getEmployeeRequests(employeeEmail, {});

    if (!result || !result.data) {
      return res.redirect('/employee-history?error=' + encodeURIComponent('Unable to access request data'));
    }

    const requests = result.data;
    const request = requests.find(r => r.uuid === requestUuid);

    if (!request) {
      return res.redirect('/employee-history?error=' + encodeURIComponent('Request not found or you do not have access to it'));
    }
    if (request.status !== 'pending') {
      return res.redirect('/employee-history?error=' + encodeURIComponent('Only pending requests can be escalated'));
    }
    if (request.escalated) {
      return res.redirect('/employee-history?error=' + encodeURIComponent('This request has already been escalated'));
    }

    const content = renderEscalation({
      csrfInput: req.csrfInput(),
      request,
    });

    res.send(renderEmployeePage('Escalate Request', content, req.session.employee.name, req.session.employee.email));
  });

  /**
   * Export employee history as CSV
   */
  exportHistory = catchAsync(async (req, res) => {
    if (!req.session.employee || !req.session.employee.email) {
      return res.redirect('/?error=authentication_required');
    }

    const { start_date, end_date, ticker, trading_type, instrument_type, sort_by = 'created_at', sort_order = 'DESC' } = req.query;
    const employeeEmail = req.session.employee.email;

    try {
      const filters = {};
      if (start_date) filters.start_date = start_date;
      if (end_date) filters.end_date = end_date;
      if (ticker) filters.ticker = ticker.toUpperCase();
      if (trading_type) filters.trading_type = trading_type;
      if (instrument_type) filters.instrument_type = instrument_type;

      const result = await TradingRequestService.getEmployeeRequests(employeeEmail, filters, sort_by, sort_order);

      if (!result || !result.data) {
        throw new Error('Unable to fetch trading requests for export - service returned no data');
      }

      const requests = result.data;

      console.log('Export debug info:', {
        employeeEmail,
        filters,
        requestCount: requests ? requests.length : 0,
        sort_by,
        sort_order
      });

      if (!requests) {
        throw new Error('No data returned from database query');
      }

      let filterSuffix = '';
      if (start_date && end_date) {
        filterSuffix = `-${start_date}-to-${end_date}`;
      } else if (start_date) {
        filterSuffix = `-from-${start_date}`;
      } else if (end_date) {
        filterSuffix = `-until-${end_date}`;
      }
      if (ticker) filterSuffix += `-${ticker}`;
      if (trading_type) filterSuffix += `-${trading_type}`;
      if (instrument_type) filterSuffix += `-${instrument_type}`;

      let timestamp;
      try {
        timestamp = formatHongKongTime(new Date(), true).replace(/[/:,\s]/g, '-');
      } catch (timeError) {
        console.error('Error formatting timestamp:', timeError);
        timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      }
      const filename = `my-trading-history${filterSuffix}-${timestamp}.csv`;

      let csvContent = 'Request ID,Date Created,Stock Name,Ticker,Trading Type,Shares,Estimated Value,Status,Escalated,Rejection Reason\n';

      if (!requests || requests.length === 0) {
        csvContent += '"No trading requests found for the selected criteria"\n';
      } else {
        requests.forEach((request, index) => {
          try {
            console.log(`Processing request ${index}:`, {
              uuid: request.uuid,
              created_at: request.created_at,
              stock_name: request.stock_name,
              ticker: request.ticker,
              trading_type: request.trading_type,
              shares: request.shares,
              status: request.status,
              keys: Object.keys(request)
            });

            let createdDate = 'N/A';
            try {
              if (request.created_at) {
                createdDate = formatHongKongTime(new Date(request.created_at));
              }
            } catch (dateError) {
              console.error('Date formatting error:', dateError);
              createdDate = request.created_at || 'N/A';
            }

            let stockName = 'N/A';
            try {
              stockName = (request.stock_name || 'N/A').toString().replace(/"/g, '""');
            } catch (nameError) {
              console.error('Stock name error:', nameError);
            }

            let estimatedValue = '0.00';
            try {
              const value = request.total_value_usd || request.total_value || 0;
              estimatedValue = parseFloat(value || 0).toFixed(2);
            } catch (valueError) {
              console.error('Value error:', valueError);
            }

            const escalated = (request.escalated === true || request.escalated === 'true') ? 'Yes' : 'No';
            const rejectionReason = (request.rejection_reason || '').toString().replace(/"/g, '""');
            const tickerVal = (request.ticker || 'N/A').toString();
            const tradingType = (request.trading_type || 'unknown').toString().toUpperCase();
            const status = (request.status || 'unknown').toString().toUpperCase();
            const shares = parseInt(request.shares || 0) || 0;
            const requestId = getDisplayId(request) || 'N/A';

            csvContent += `"${requestId}","${createdDate}","${stockName}","${tickerVal}","${tradingType}","${shares}","$${estimatedValue}","${status}","${escalated}","${rejectionReason}"\n`;

          } catch (rowError) {
            console.error('Error processing row:', rowError.message, 'Request keys:', request ? Object.keys(request) : 'null');
            console.error('Full request object:', request);
            csvContent += `"Error processing request ${request?.uuid || 'unknown'}: ${rowError.message}"\n`;
          }
        });
      }

      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
      res.send(csvContent);

    } catch (error) {
      console.error('Export history error:', error);
      return res.redirect('/employee-history?error=export_failed');
    }
  });
}

module.exports = new EmployeeController();
