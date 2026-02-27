// HTML Template utilities to eliminate duplicate HTML across routes

function renderBasePage(title, subtitle, content, navigation = '') {
  return `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <meta name="color-scheme" content="light dark">
    <title>${title} - Inspiration Capital Management Limited</title>
    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
    <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap">
    <link rel="stylesheet" href="/styles-modern.min.css?v=3.0">
</head>
<body>
    <header class="site-header">
        <div class="header-inner">
            <div class="header-brand">
                <span class="brand-name">Inspiration Capital</span>
                <span class="brand-divider" aria-hidden="true"></span>
                <span class="brand-module">Trading Compliance</span>
            </div>
            <div class="header-meta">${subtitle}</div>
        </div>
    </header>
    ${navigation}
    <main class="main-content">
        <div class="container">
            ${content}
        </div>
    </main>
    <footer class="site-footer">
        <span>Inspiration Capital Management Limited</span>
        <span class="footer-separator" aria-hidden="true">|</span>
        <span>Compliance Portal</span>
    </footer>
</body>
</html>`;
}

function renderAdminPage(title, content) {
  const navigation = `
    <nav class="nav container" aria-label="Admin navigation">
        <a href="/admin-dashboard" class="nav-link ${title === 'Administrator Dashboard' || title === 'Backup Management' || title === 'Backup Scheduler Status' || title === 'Confirm Database Reset' || title === 'Audit Log' ? 'active' : ''}">Dashboard</a>
        <a href="/admin-restricted-stocks" class="nav-link ${title === 'Restricted Stocks' ? 'active' : ''}">Restricted Stocks</a>
        <a href="/admin-requests" class="nav-link ${title === 'Trading Requests' || title === 'Reject Trading Request' ? 'active' : ''}">Trading Requests</a>
        <a href="/admin-statements" class="nav-link ${title === 'Statement Requests' || title === 'Statement Scheduler' ? 'active' : ''}">Statements</a>
        <a href="/guides" class="nav-link ${title === 'Guides' ? 'active' : ''}">Guides</a>
        <a href="/admin-logout" class="nav-link">Logout</a>
    </nav>`;

  return renderBasePage(title, 'Administrator Dashboard', content, navigation);
}

function renderEmployeePage(title, content, employeeName = '', employeeEmail = '') {
  const navigation = `
    <nav class="nav container" aria-label="Employee navigation">
        <a href="/employee-dashboard" class="nav-link ${title === 'Employee Dashboard' || title === 'Trading Request Preview' || title === 'Trading Request Result' ? 'active' : ''}">Dashboard</a>
        <a href="/employee-history" class="nav-link ${title === 'Trading History' || title === 'Request History' ? 'active' : ''}">My History</a>
        <a href="/employee-brokerage-accounts" class="nav-link ${title === 'Brokerage Accounts' ? 'active' : ''}">Accounts</a>
        <a href="/guides" class="nav-link ${title === 'Guides' ? 'active' : ''}">Guides</a>
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
        message = 'Database successfully reset. All data has been permanently cleared.';
        break;
      case 'statement_emails_sent':
        message = 'Monthly statement request emails have been sent successfully';
        break;
      case 'statement_email_resent':
        message = 'Statement request email has been resent';
        break;
      case 'statement_uploaded':
        message = 'Trading statement uploaded successfully';
        break;
      case 'accounts_confirmed':
        message = 'Your brokerage accounts have been confirmed. Thank you!';
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

  return `
        <div class="${type === 'success' ? 'alert-success' : type === 'error' ? 'alert-error' : 'alert-info'} alert" role="alert">
            <strong>${message}</strong>
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
