// HTML Template utilities to eliminate duplicate HTML across routes

function renderBasePage(title, subtitle, content, navigation = '') {
  return `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${title} - Inspiration Capital Management Limited</title>
    <link rel="stylesheet" href="/styles-modern.css">
</head>
<body>
    <div class="container">
        <header>
            <div class="header-content">
                <div>
                    <h1>Trading Compliance Portal</h1>
                    <div class="header-subtitle">Inspiration Capital Management Limited</div>
                    <div class="text-sm text-muted mt-1">${subtitle}</div>
                </div>
            </div>
        </header>
        
        ${navigation}
        
        <main>
            ${content}
        </main>
    </div>
</body>
</html>`;
}

function renderAdminPage(title, content) {
  const navigation = `
        <nav class="nav mb-6">
            <a href="/admin-dashboard" class="nav-link ${title === 'Admin Dashboard' ? 'active' : ''}">Dashboard</a>
            <a href="/admin-restricted-stocks" class="nav-link ${title === 'Restricted Stocks Management' ? 'active' : ''}">Restricted Stocks</a>
            <a href="/admin-requests" class="nav-link ${title === 'Trading Requests' ? 'active' : ''}">Trading Requests</a>
            <a href="/admin-logout" class="nav-link">Logout</a>
        </nav>`;
  
  return renderBasePage(title, 'Administrator Dashboard', content, navigation);
}

function renderEmployeePage(title, content, employeeName = '', employeeEmail = '') {
  const navigation = `
        <nav class="nav mb-6">
            <a href="/employee-dashboard" class="nav-link ${title === 'Employee Dashboard' ? 'active' : ''}">Dashboard</a>
            <a href="/employee-history" class="nav-link ${title === 'Trading History' || title === 'Request History' ? 'active' : ''}">My History</a>
            <a href="/employee-logout" class="nav-link">Logout</a>
        </nav>`;
  
  const subtitle = employeeName ? `Welcome, ${employeeName}` : 'Pre-Trading Approval & Risk Management System';
  return renderBasePage(title, subtitle, content, navigation);
}

function renderPublicPage(title, content) {
  return renderBasePage(title, 'Pre-Trading Approval & Risk Management System', content);
}

function generateNotificationBanner(query) {
  if (!query || Object.keys(query).length === 0) {
    return '';
  }

  let message = '';
  let type = 'info';

  // Success messages
  if (query.message) {
    type = 'success';
    switch (query.message) {
      case 'stock_added':
        message = 'Stock added successfully';
        if (query.ticker && query.company) {
          message = `${decodeURIComponent(query.ticker)} (${decodeURIComponent(query.company)}) has been added to the restricted stocks list.`;
        }
        break;
      case 'stock_removed':
        message = 'Stock removed successfully';
        break;
      case 'request_approved':
        message = 'Trading request approved successfully';
        break;
      case 'request_rejected':
        message = 'Trading request rejected';
        break;
      case 'escalation_submitted':
        message = 'Escalation submitted successfully';
        break;
      case 'admin_logged_out':
        message = 'You have been logged out successfully';
        break;
      case 'database_cleared':
        message = '✅ Database Successfully Reset! All data has been permanently cleared and the system has been reset to brand new state.';
        break;
      default:
        message = decodeURIComponent(query.message);
    }
  }

  // Error messages
  if (query.error) {
    type = 'error';
    switch (query.error) {
      case 'authentication_required':
        message = 'Authentication required. Please log in.';
        break;
      case 'invalid_credentials':
        message = 'Invalid username or password. Please try again.';
        break;
      case 'invalid_ticker':
        message = 'Invalid ticker format or ticker not found';
        if (query.ticker) {
          message += `: ${decodeURIComponent(query.ticker)}`;
        }
        break;
      case 'stock_already_exists':
        message = 'Stock is already in the restricted list';
        if (query.ticker) {
          message += `: ${decodeURIComponent(query.ticker)}`;
        }
        break;
      case 'ticker_required':
        message = 'Stock ticker is required';
        break;
      case 'add_failed':
        message = 'Failed to add stock to restricted list';
        if (query.details) {
          message += `: ${decodeURIComponent(query.details)}`;
        }
        break;
      case 'export_failed':
        message = 'Failed to export trading history. Please try again or contact support if the problem persists.';
        break;
      default:
        message = decodeURIComponent(query.error);
    }
  }

  if (!message) return '';

  const bgColor = type === 'success' ? '#d1ecf1' : type === 'error' ? '#f8d7da' : '#d4edda';
  const borderColor = type === 'success' ? '#bee5eb' : type === 'error' ? '#f5c6cb' : '#c3e6cb';
  const textColor = type === 'success' ? '#0c5460' : type === 'error' ? '#721c24' : '#155724';
  const icon = type === 'success' ? '✅' : type === 'error' ? '❌' : 'ℹ️';

  return `
        <div class="border rounded p-4 mb-6" style="background: ${bgColor}; border-color: ${borderColor}; color: ${textColor};">
            <strong>${icon} ${message}</strong>
        </div>`;
}

function renderCard(title, content, subtitle = '') {
  return `
        <div class="card mb-6">
            <div class="card-header">
                <h3 class="card-title">${title}</h3>
                ${subtitle ? `<p class="mt-2 m-0 text-muted font-sm">${subtitle}</p>` : ''}
            </div>
            <div class="card-body">
                ${content}
            </div>
        </div>`;
}

function renderTable(headers, rows, emptyMessage = 'No data found') {
  const headerCells = headers.map(header => `<th>${header}</th>`).join('');
  const tableRows = rows.length > 0 ? rows.join('') : 
    `<tr><td colspan="${headers.length}" class="text-center p-6 text-muted">${emptyMessage}</td></tr>`;

  return `
                <div class="table-container">
                    <table class="modern-table">
                        <thead>
                            <tr>
                                ${headerCells}
                            </tr>
                        </thead>
                        <tbody>
                            ${tableRows}
                        </tbody>
                    </table>
                </div>`;
}

module.exports = {
  renderBasePage,
  renderAdminPage, 
  renderEmployeePage,
  renderPublicPage,
  generateNotificationBanner,
  renderCard,
  renderTable
};