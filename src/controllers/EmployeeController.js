const TradingRequestService = require('../services/TradingRequestService');
const { catchAsync } = require('../middleware/errorHandler');
const { renderEmployeePage, generateNotificationBanner } = require('../utils/templates');

class EmployeeController {
  /**
   * Get employee dashboard
   */
  getDashboard = catchAsync(async (req, res) => {
    // Check if user is properly authenticated
    if (!req.session.employee || !req.session.employee.email) {
      return res.redirect('/?error=authentication_required');
    }
    
    const { error, message, ticker, shares, trading_type } = req.query;
    let banner = '';
    
    if (error) {
      banner = generateNotificationBanner({ error: error });
    } else if (message === 'login_success') {
      banner = generateNotificationBanner({ message: 'Welcome! You have been successfully logged in.' });
    }

    // Pre-fill form if provided in query params
    const prefilledTicker = ticker ? decodeURIComponent(ticker) : '';
    const prefilledShares = shares ? decodeURIComponent(shares) : '';
    const prefilledType = trading_type ? decodeURIComponent(trading_type) : 'buy';

    const dashboardContent = `
      ${banner}
      <div class="card">
        <div class="card-header">
          <h3 class="card-title">Submit Trading Request</h3>
        </div>
        <div class="card-body">
          <form method="post" action="/preview-trade" id="tradingForm">
            ${req.csrfInput()}
            <div style="display: grid; gap: var(--spacing-4);">
              <div>
                <label style="display: block; margin-bottom: var(--spacing-2); font-weight: 600;">Stock Ticker *</label>
                <input type="text" name="ticker" value="${prefilledTicker}" required 
                       placeholder="e.g., AAPL, MSFT, GOOGL" 
                       style="width: 100%; padding: var(--spacing-3); border: 1px solid var(--gs-neutral-300); border-radius: var(--radius); text-transform: uppercase;"
                       maxlength="15" pattern="[A-Za-z0-9.-]+">
                <div style="margin-top: var(--spacing-2);">
                  <small style="color: var(--gs-neutral-600);">Enter a valid stock ticker symbol. Examples:</small>
                  <div style="margin-top: var(--spacing-1); padding: var(--spacing-2); background: var(--gs-neutral-100); border-radius: var(--radius); font-size: 14px;">
                    <strong>US Markets:</strong> AAPL, MSFT, GOOGL, TSLA, NVDA, AMZN<br>
                    <strong>Hong Kong:</strong> 0700.HK (Tencent), 9988.HK (Alibaba), 2318.HK (Ping An)<br>
                    <strong>UK:</strong> BARC.L (Barclays), LLOY.L (Lloyds), VOD.L (Vodafone)<br>
                    <strong>Europe:</strong> ASML.AS (ASML), SAP.DE (SAP), NESN.SW (Nestle)
                  </div>
                </div>
              </div>
              
              <div>
                <label style="display: block; margin-bottom: var(--spacing-2); font-weight: 600;">Number of Shares *</label>
                <input type="number" name="shares" value="${prefilledShares}" required min="1" max="1000000"
                       style="width: 100%; padding: var(--spacing-3); border: 1px solid var(--gs-neutral-300); border-radius: var(--radius);">
                <small style="color: var(--gs-neutral-600);">Enter the number of shares (1 - 1,000,000)</small>
              </div>
              
              <div>
                <label style="display: block; margin-bottom: var(--spacing-2); font-weight: 600;">Trading Type *</label>
                <div style="display: flex; gap: var(--spacing-4);">
                  <label style="display: flex; align-items: center; cursor: pointer;">
                    <input type="radio" name="trading_type" value="buy" ${prefilledType === 'buy' ? 'checked' : ''} 
                           style="margin-right: var(--spacing-2);">
                    <span style="color: var(--gs-success); font-weight: 600;">BUY</span>
                  </label>
                  <label style="display: flex; align-items: center; cursor: pointer;">
                    <input type="radio" name="trading_type" value="sell" ${prefilledType === 'sell' ? 'checked' : ''} 
                           style="margin-right: var(--spacing-2);">
                    <span style="color: var(--gs-danger); font-weight: 600;">SELL</span>
                  </label>
                </div>
              </div>
            </div>
            
            <div style="margin-top: var(--spacing-6); text-align: center;">
              <button type="submit" class="btn btn-primary" style="padding: 15px 30px; font-size: 16px;">
                Preview Trading Request
              </button>
            </div>
          </form>
        </div>
      </div>


    `;

    const html = renderEmployeePage('Employee Dashboard', dashboardContent, req.session.employee.name, req.session.employee.email);
    res.send(html);
  });

  /**
   * Get employee history
   */
  getHistory = catchAsync(async (req, res) => {
    const { message, error, start_date, end_date, ticker, trading_type, status, sort_by = 'id', sort_order = 'DESC', page = 1, limit = 25 } = req.query;
    
    // Check if user is properly authenticated
    if (!req.session.employee || !req.session.employee.email) {
      return res.redirect('/?error=authentication_required');
    }
    
    const employeeEmail = req.session.employee.email;
    
    let banner = '';
    if (message === 'escalation_submitted') {
      banner = generateNotificationBanner({ message: 'Your escalation has been submitted successfully and will be reviewed by administrators.' });
    } else if (error) {
      banner = generateNotificationBanner({ error: error });
    }

    // Validate pagination params
    const validatedPage = Math.max(1, parseInt(page) || 1);
    const validatedLimit = Math.min(100, Math.max(1, parseInt(limit) || 25));
    
    // Build filters
    const filters = {
      page: validatedPage,
      limit: validatedLimit
    };
    if (start_date) filters.start_date = start_date;
    if (end_date) filters.end_date = end_date;
    if (ticker) filters.ticker = ticker.toUpperCase();
    if (trading_type) filters.trading_type = trading_type;
    if (status) filters.status = status;

    const result = await TradingRequestService.getEmployeeRequests(employeeEmail, filters, sort_by, sort_order);
    
    // Handle service errors gracefully  
    if (!result || !result.data) {
      console.error('EmployeeController.getHistory: Service returned no data', { result, employeeEmail, filters });
      throw new Error('Unable to fetch trading requests - service returned no data');
    }
    
    const requests = result.data;
    const pagination = result.pagination;

    // Generate table rows
    const tableRows = requests.map(request => {
      const date = formatHongKongTime(new Date(request.created_at));
      const statusColor = request.status === 'approved' ? '#28a745' : 
                         request.status === 'rejected' ? '#dc3545' : '#ffc107';

      return `
        <tr>
          <td style="text-align: center;">${request.id}</td>
          <td style="text-align: center;">${date}</td>
          <td>${request.stock_name || 'N/A'}</td>
          <td style="text-align: center; font-weight: 600;">${request.ticker}</td>
          <td style="text-align: center;">${request.trading_type.toUpperCase()}</td>
          <td style="text-align: center;">${parseInt(request.shares).toLocaleString()}</td>
          <td style="text-align: center;">
            $${parseFloat(request.total_value_usd || request.total_value || 0).toLocaleString('en-US', {minimumFractionDigits: 2})}
          </td>
          <td style="text-align: center;">
            <span style="background: ${statusColor}; color: white; padding: 4px 8px; border-radius: 4px; font-size: var(--font-size-xs); font-weight: 500;">
              ${request.status.toUpperCase()}
            </span>
          </td>
          <td style="text-align: center;">
            ${request.status === 'rejected' && request.rejection_reason ? 
              `<span style="color: #dc3545; font-size: var(--font-size-xs); cursor: help;" title="${request.rejection_reason}">View Reason</span>` :
              (request.status === 'pending' && !request.escalated ? 
                `<a href="/escalate-form/${request.id}" class="btn btn-outline" style="padding: 2px 8px; font-size: var(--font-size-xs); text-decoration: none;">Escalate</a>` :
                (request.escalated ? 
                  '<span style="color: #ffc107; font-size: var(--font-size-xs);">Escalated</span>' :
                  '<span style="color: var(--gs-neutral-500); font-size: var(--font-size-xs);">-</span>')
              )
            }
          </td>
        </tr>
      `;
    });

    // Generate sorting controls
    const currentSortBy = req.query.sort_by || 'id';
    const currentSortOrder = req.query.sort_order || 'DESC';
    const sortingControls = generateSortingControls('/employee-history', currentSortBy, currentSortOrder, req.query);

    const historyContent = `
      ${banner}
      
      <!-- Filters Card -->
      <div class="card" style="margin-bottom: var(--spacing-6);">
        <div class="card-header">
          <h3 class="card-title">Filter Requests</h3>
        </div>
        <div class="card-body">
          <form method="get" action="/employee-history">
            <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: var(--spacing-4);">
              <div>
                <label style="display: block; margin-bottom: var(--spacing-2); font-weight: 600;">Start Date:</label>
                <input type="date" name="start_date" value="${start_date || ''}" 
                       style="width: 100%; padding: var(--spacing-2); border: 1px solid var(--gs-neutral-300); border-radius: var(--radius);">
              </div>
              <div>
                <label style="display: block; margin-bottom: var(--spacing-2); font-weight: 600;">End Date:</label>
                <input type="date" name="end_date" value="${end_date || ''}" 
                       style="width: 100%; padding: var(--spacing-2); border: 1px solid var(--gs-neutral-300); border-radius: var(--radius);">
              </div>
              <div>
                <label style="display: block; margin-bottom: var(--spacing-2); font-weight: 600;">Ticker:</label>
                <input type="text" name="ticker" value="${ticker || ''}" placeholder="e.g., AAPL" 
                       style="width: 100%; padding: var(--spacing-2); border: 1px solid var(--gs-neutral-300); border-radius: var(--radius); text-transform: uppercase;">
              </div>
              <div>
                <label style="display: block; margin-bottom: var(--spacing-2); font-weight: 600;">Type:</label>
                <select name="trading_type" 
                        style="width: 100%; padding: var(--spacing-2); border: 1px solid var(--gs-neutral-300); border-radius: var(--radius);">
                  <option value="">All Types</option>
                  <option value="buy" ${trading_type === 'buy' ? 'selected' : ''}>Buy</option>
                  <option value="sell" ${trading_type === 'sell' ? 'selected' : ''}>Sell</option>
                </select>
              </div>
              <div>
                <label style="display: block; margin-bottom: var(--spacing-2); font-weight: 600;">Status:</label>
                <select name="status" 
                        style="width: 100%; padding: var(--spacing-2); border: 1px solid var(--gs-neutral-300); border-radius: var(--radius);">
                  <option value="">All Statuses</option>
                  <option value="approved" ${req.query.status === 'approved' ? 'selected' : ''}>Approved</option>
                  <option value="rejected" ${req.query.status === 'rejected' ? 'selected' : ''}>Rejected</option>
                  <option value="pending" ${req.query.status === 'pending' ? 'selected' : ''}>Pending</option>
                </select>
              </div>
            </div>
            <div style="margin-top: var(--spacing-4); text-align: center;">
              <button type="submit" class="btn btn-primary" style="margin-right: var(--spacing-3);">Apply Filters</button>
              <a href="/employee-history" class="btn btn-secondary" style="text-decoration: none;">Clear Filters</a>
            </div>
          </form>
        </div>
      </div>

      <!-- Results Card -->
      <div class="card">
        <div class="card-header">
          <h3 class="card-title">Trading Request History (${pagination ? `${pagination.total} total, showing ${requests.length}` : `${requests.length} requests`}) - Page ${pagination?.page || 1}/${pagination?.pages || 1}</h3>
        </div>
        <div class="card-body">
          ${requests.length > 0 ? `
            <div class="table-container">
              <table class="table">
                <thead>
                  <tr>
                    <th>
                      <a href="/employee-history?${new URLSearchParams({...req.query, sort_by: 'id', sort_order: currentSortBy === 'id' && currentSortOrder === 'ASC' ? 'DESC' : 'ASC'}).toString()}" 
                         style="text-decoration: none; color: inherit; display: flex; align-items: center; justify-content: space-between;">
                        ID ${currentSortBy === 'id' ? (currentSortOrder === 'ASC' ? '↑' : '↓') : ''}
                      </a>
                    </th>
                    <th>
                      <a href="/employee-history?${new URLSearchParams({...req.query, sort_by: 'created_at', sort_order: currentSortBy === 'created_at' && currentSortOrder === 'ASC' ? 'DESC' : 'ASC'}).toString()}" 
                         style="text-decoration: none; color: inherit; display: flex; align-items: center; justify-content: space-between;">
                        Date ${currentSortBy === 'created_at' ? (currentSortOrder === 'ASC' ? '↑' : '↓') : ''}
                      </a>
                    </th>
                    <th>Company</th>
                    <th>
                      <a href="/employee-history?${new URLSearchParams({...req.query, sort_by: 'ticker', sort_order: currentSortBy === 'ticker' && currentSortOrder === 'ASC' ? 'DESC' : 'ASC'}).toString()}" 
                         style="text-decoration: none; color: inherit; display: flex; align-items: center; justify-content: space-between;">
                        Ticker ${currentSortBy === 'ticker' ? (currentSortOrder === 'ASC' ? '↑' : '↓') : ''}
                      </a>
                    </th>
                    <th>Type</th>
                    <th>Shares</th>
                    <th>
                      <a href="/employee-history?${new URLSearchParams({...req.query, sort_by: 'total_value_usd', sort_order: currentSortBy === 'total_value_usd' && currentSortOrder === 'ASC' ? 'DESC' : 'ASC'}).toString()}" 
                         style="text-decoration: none; color: inherit; display: flex; align-items: center; justify-content: space-between;">
                        Total Value (USD) ${currentSortBy === 'total_value_usd' ? (currentSortOrder === 'ASC' ? '↑' : '↓') : ''}
                      </a>
                    </th>
                    <th>Status</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  ${tableRows.join('')}
                </tbody>
              </table>
            </div>
            ${pagination && pagination.pages > 1 ? `
            <div style="margin-top: var(--spacing-4); display: flex; justify-content: center; align-items: center; gap: var(--spacing-2);">
              ${pagination.page > 1 ? `
                <a href="/employee-history?${new URLSearchParams({...req.query, page: pagination.page - 1}).toString()}" 
                   class="btn btn-secondary btn-sm" style="text-decoration: none;">← Previous</a>
              ` : '<span class="btn btn-secondary btn-sm" style="opacity: 0.5; cursor: not-allowed;">← Previous</span>'}
              
              <span style="padding: 0 var(--spacing-3);">
                Page ${pagination.page} of ${pagination.pages} (${pagination.total} total)
              </span>
              
              ${pagination.page < pagination.pages ? `
                <a href="/employee-history?${new URLSearchParams({...req.query, page: pagination.page + 1}).toString()}" 
                   class="btn btn-secondary btn-sm" style="text-decoration: none;">Next →</a>
              ` : '<span class="btn btn-secondary btn-sm" style="opacity: 0.5; cursor: not-allowed;">Next →</span>'}
            </div>
            ` : ''}
          ` : `
            <div style="text-align: center; padding: var(--spacing-8); color: var(--gs-neutral-600);">
              <p>No trading requests found${Object.keys(filters).length > 0 ? ' matching your filters' : ''}.</p>
              <a href="/employee-dashboard" class="btn btn-primary" style="margin-top: var(--spacing-4); text-decoration: none;">
                Submit Your First Request
              </a>
            </div>
          `}
        </div>
      </div>

      <div style="margin-top: var(--spacing-6); text-align: center;">
        <a href="/employee-dashboard" class="btn btn-secondary" style="text-decoration: none; margin-right: var(--spacing-3);">
          ← Back to Dashboard
        </a>
        <a href="/employee-export-history?${new URLSearchParams(req.query).toString()}" class="btn btn-outline" style="text-decoration: none;">
          📥 Export History (CSV)
        </a>
      </div>

    `;

    const html = renderEmployeePage('Request History', historyContent, req.session.employee.name, req.session.employee.email);
    res.send(html);
  });

  /**
   * Get escalation form
   */
  getEscalationForm = catchAsync(async (req, res) => {
    const requestId = parseInt(req.params.id);
    
    // Check if user is properly authenticated
    if (!req.session.employee || !req.session.employee.email) {
      return res.redirect('/?error=authentication_required');
    }
    
    const employeeEmail = req.session.employee.email;

    // Get the specific request to validate ownership
    const result = await TradingRequestService.getEmployeeRequests(employeeEmail, {});
    
    // Handle service errors gracefully
    if (!result || !result.data) {
      return res.redirect('/employee-history?error=' + encodeURIComponent('Unable to access request data'));
    }
    
    const requests = result.data;
    const request = requests.find(r => r.id === requestId);

    if (!request) {
      return res.redirect('/employee-history?error=' + encodeURIComponent('Request not found or you do not have access to it'));
    }

    if (request.status !== 'pending') {
      return res.redirect('/employee-history?error=' + encodeURIComponent('Only pending requests can be escalated'));
    }

    if (request.escalated) {
      return res.redirect('/employee-history?error=' + encodeURIComponent('This request has already been escalated'));
    }

    const escalationContent = `
      <div class="card">
        <div class="card-header">
          <h3 class="card-title">Escalate Trading Request #${request.id}</h3>
        </div>
        <div class="card-body">
          <div style="background: var(--gs-neutral-100); padding: var(--spacing-4); border-radius: var(--radius); margin-bottom: var(--spacing-6);">
            <h4 style="margin: 0 0 var(--spacing-3) 0;">Request Details:</h4>
            <div style="display: grid; gap: var(--spacing-2);">
              <div><strong>Stock:</strong> ${request.stock_name} (${request.ticker})</div>
              <div><strong>Type:</strong> ${request.trading_type.toUpperCase()}</div>
              <div><strong>Shares:</strong> ${parseInt(request.shares).toLocaleString()}</div>
              <div><strong>Estimated Value:</strong> $${parseFloat(request.total_value_usd || request.total_value || 0).toLocaleString('en-US', {minimumFractionDigits: 2})}</div>
              <div><strong>Submitted:</strong> ${formatHongKongTime(new Date(request.created_at))}</div>
            </div>
          </div>

          <form method="post" action="/submit-escalation">\n            ${req.csrfInput()}
            <input type="hidden" name="requestId" value="${request.id}">
            
            <div style="margin-bottom: var(--spacing-4);">
              <label style="display: block; margin-bottom: var(--spacing-2); font-weight: 600;">
                Escalation Reason: <span style="color: var(--gs-danger);">*</span>
              </label>
              <textarea name="escalation_reason" required rows="5" 
                        placeholder="Please explain why you are escalating this request. Provide any additional context or urgency that administrators should be aware of."
                        style="width: 100%; padding: var(--spacing-3); border: 1px solid var(--gs-neutral-300); border-radius: var(--radius); resize: vertical;"></textarea>
              <small style="color: var(--gs-neutral-600);">
                Escalating a request will notify administrators for priority review. Please provide a clear reason.
              </small>
            </div>

            <div style="text-align: right; margin-top: var(--spacing-6);">
              <a href="/employee-history" class="btn btn-secondary" style="text-decoration: none; margin-right: var(--spacing-3);">
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

    const html = renderEmployeePage('Escalate Request', escalationContent, req.session.employee.name, req.session.employee.email);
    res.send(html);
  });

  /**
   * Export employee history as CSV
   */
  exportHistory = catchAsync(async (req, res) => {
    // Check authentication (redundant check for safety)
    if (!req.session.employee || !req.session.employee.email) {
      return res.redirect('/?error=authentication_required');
    }

    const { start_date, end_date, ticker, trading_type, sort_by = 'id', sort_order = 'DESC' } = req.query;
    const employeeEmail = req.session.employee.email;
    
    try {
      // Build filters (no pagination for CSV export - explicitly exclude page/limit)
      const filters = {};
      if (start_date) filters.start_date = start_date;
      if (end_date) filters.end_date = end_date;
      if (ticker) filters.ticker = ticker.toUpperCase();
      if (trading_type) filters.trading_type = trading_type;

      const result = await TradingRequestService.getEmployeeRequests(employeeEmail, filters, sort_by, sort_order);
      
      // Handle service errors gracefully
      if (!result || !result.data) {
        throw new Error('Unable to fetch trading requests for export - service returned no data');
      }
      
      const requests = result.data;

      // Debug logging
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

    // Create filename with filters
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

    let timestamp;
    try {
      timestamp = formatHongKongTime(new Date(), true).replace(/[/:,\s]/g, '-');
    } catch (timeError) {
      console.error('Error formatting timestamp:', timeError);
      timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    }
    const filename = `my-trading-history${filterSuffix}-${timestamp}.csv`;

    let csvContent = 'Request ID,Date Created,Stock Name,Ticker,Trading Type,Shares,Estimated Value,Status,Escalated,Rejection Reason\n';
    
    // Handle empty results case
    if (!requests || requests.length === 0) {
      csvContent += '"No trading requests found for the selected criteria"\n';
    } else {
      requests.forEach((request, index) => {
        try {
          // Log the request object structure for debugging
          console.log(`Processing request ${index}:`, {
            id: request.id,
            created_at: request.created_at,
            stock_name: request.stock_name,
            ticker: request.ticker,
            trading_type: request.trading_type,
            shares: request.shares,
            status: request.status,
            keys: Object.keys(request)
          });

          // Process each field individually with error handling
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
          const ticker = (request.ticker || 'N/A').toString();
          const tradingType = (request.trading_type || 'unknown').toString().toUpperCase();
          const status = (request.status || 'unknown').toString().toUpperCase();
          const shares = parseInt(request.shares || 0) || 0;
          const requestId = request.id || 'N/A';
          
          csvContent += `"${requestId}","${createdDate}","${stockName}","${ticker}","${tradingType}","${shares}","$${estimatedValue}","${status}","${escalated}","${rejectionReason}"\n`;
          
        } catch (rowError) {
          console.error('Error processing row:', rowError.message, 'Request keys:', request ? Object.keys(request) : 'null');
          console.error('Full request object:', request);
          csvContent += `"Error processing request ${request?.id || 'unknown'}: ${rowError.message}"\n`;
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

// Helper functions
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

function getSortDisplayName(sortBy) {
  const displayNames = {
    'id': 'Request ID',
    'created_at': 'Date',
    'ticker': 'Ticker',
    'employee_email': 'Employee'
  };
  return displayNames[sortBy] || 'Request ID';
}

function generateSortingControls(baseUrl, currentSortBy, currentSortOrder, queryParams = {}) {
  // Remove existing sort parameters
  const cleanParams = { ...queryParams };
  delete cleanParams.sort_by;
  delete cleanParams.sort_order;
  
  return `
    <form method="get" action="${baseUrl}" style="display: flex; align-items: center; gap: var(--spacing-3); flex-wrap: wrap;">
      ${Object.entries(cleanParams).map(([key, value]) => 
        `<input type="hidden" name="${key}" value="${value || ''}">`
      ).join('')}
      
      <span style="font-weight: 600; color: var(--gs-neutral-700);">Sort by:</span>
      <select name="sort_by" style="padding: 6px 10px; border: 1px solid var(--gs-neutral-300); border-radius: var(--radius);">
        <option value="id" ${currentSortBy === 'id' ? 'selected' : ''}>Request ID</option>
        <option value="created_at" ${currentSortBy === 'created_at' ? 'selected' : ''}>Date</option>
        <option value="ticker" ${currentSortBy === 'ticker' ? 'selected' : ''}>Ticker</option>
      </select>
      <select name="sort_order" style="padding: 6px 10px; border: 1px solid var(--gs-neutral-300); border-radius: var(--radius);">
        <option value="DESC" ${currentSortOrder === 'DESC' ? 'selected' : ''}>↓ Descending</option>
        <option value="ASC" ${currentSortOrder === 'ASC' ? 'selected' : ''}>↑ Ascending</option>
      </select>
      <button type="submit" class="btn btn-primary btn-sm" style="padding: 6px 15px; font-size: var(--font-size-sm);">
        Apply Sort
      </button>
    </form>
  `;
}

module.exports = new EmployeeController();