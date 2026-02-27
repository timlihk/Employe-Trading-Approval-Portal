const {
  renderBasePage,
  renderAdminPage,
  renderEmployeePage,
  renderPublicPage,
  generateNotificationBanner,
  renderCard,
  renderTable
} = require('../../../src/utils/templates');

describe('templates', () => {
  describe('renderBasePage', () => {
    test('should render a complete HTML page with title and content', () => {
      const html = renderBasePage('Test Title', 'Subtitle', '<p>Hello</p>');

      expect(html).toContain('<!DOCTYPE html>');
      expect(html).toContain('<html lang="en">');
      expect(html).toContain('Test Title - Inspiration Capital Management Limited');
      expect(html).toContain('Subtitle');
      expect(html).toContain('<p>Hello</p>');
    });

    test('should include meta viewport tag', () => {
      const html = renderBasePage('Test', 'Sub', 'Content');
      expect(html).toContain('meta name="viewport"');
    });

    test('should include font and CSS stylesheet links', () => {
      const html = renderBasePage('Test', 'Sub', 'Content');
      expect(html).toContain('fonts.googleapis.com');
      expect(html).toContain('styles-modern.min.css');
    });

    test('should include the header with brand name and module', () => {
      const html = renderBasePage('Test', 'Sub', 'Content');
      expect(html).toContain('Inspiration Capital');
      expect(html).toContain('Trading Compliance');
    });

    test('should include the subtitle in header meta', () => {
      const html = renderBasePage('Test', 'My Subtitle', 'Content');
      expect(html).toContain('My Subtitle');
    });

    test('should include the footer', () => {
      const html = renderBasePage('Test', 'Sub', 'Content');
      expect(html).toContain('Inspiration Capital Management Limited');
      expect(html).toContain('Compliance Portal');
    });

    test('should include navigation when provided', () => {
      const nav = '<nav><a href="/">Home</a></nav>';
      const html = renderBasePage('Test', 'Sub', 'Content', nav);
      expect(html).toContain(nav);
    });

    test('should render without navigation by default', () => {
      const html = renderBasePage('Test', 'Sub', 'Content');
      expect(html).not.toContain('<nav');
    });

    test('should wrap content in main and container elements', () => {
      const html = renderBasePage('Test', 'Sub', '<div>My Content</div>');
      expect(html).toContain('<main class="main-content">');
      expect(html).toContain('<div class="container">');
      expect(html).toContain('<div>My Content</div>');
    });

    test('should include version parameter on CSS link for cache busting', () => {
      const html = renderBasePage('Test', 'Sub', 'Content');
      expect(html).toMatch(/styles-modern\.min\.css\?v=/);
    });
  });

  describe('renderAdminPage', () => {
    test('should render admin navigation links', () => {
      const html = renderAdminPage('Admin Test', '<p>Admin Content</p>');
      expect(html).toContain('admin-dashboard');
      expect(html).toContain('admin-restricted-stocks');
      expect(html).toContain('admin-requests');
      expect(html).toContain('admin-statements');
      expect(html).toContain('admin-logout');
      expect(html).toContain('guides');
    });

    test('should set "Administrator Dashboard" as subtitle', () => {
      const html = renderAdminPage('Admin Test', 'Content');
      expect(html).toContain('Administrator Dashboard');
    });

    test('should mark Dashboard nav link as active for Dashboard title', () => {
      const html = renderAdminPage('Administrator Dashboard', 'Content');
      // The Dashboard link should have 'active' class
      expect(html).toContain('admin-dashboard');
      expect(html).toMatch(/admin-dashboard.*active/s);
    });

    test('should mark Restricted Stocks nav link as active for that title', () => {
      const html = renderAdminPage('Restricted Stocks', 'Content');
      expect(html).toMatch(/admin-restricted-stocks.*active/s);
    });

    test('should mark Trading Requests nav link as active for that title', () => {
      const html = renderAdminPage('Trading Requests', 'Content');
      expect(html).toMatch(/admin-requests.*active/s);
    });
  });

  describe('renderEmployeePage', () => {
    test('should render employee navigation links', () => {
      const html = renderEmployeePage('Employee Test', '<p>Employee Content</p>');
      expect(html).toContain('employee-dashboard');
      expect(html).toContain('employee-history');
      expect(html).toContain('employee-brokerage-accounts');
      expect(html).toContain('employee-logout');
      expect(html).toContain('guides');
    });

    test('should use employee name in subtitle when provided', () => {
      const html = renderEmployeePage('Dashboard', 'Content', 'John Doe');
      expect(html).toContain('Welcome, John Doe');
    });

    test('should use default subtitle when employee name is not provided', () => {
      const html = renderEmployeePage('Dashboard', 'Content');
      expect(html).toContain('Pre-Trading Approval');
    });

    test('should mark Dashboard nav link as active for Employee Dashboard', () => {
      const html = renderEmployeePage('Employee Dashboard', 'Content');
      expect(html).toMatch(/employee-dashboard.*active/s);
    });

    test('should mark History nav link as active for Trading History', () => {
      const html = renderEmployeePage('Trading History', 'Content');
      expect(html).toMatch(/employee-history.*active/s);
    });

    test('should mark Accounts nav link as active for Brokerage Accounts', () => {
      const html = renderEmployeePage('Brokerage Accounts', 'Content');
      expect(html).toMatch(/employee-brokerage-accounts.*active/s);
    });
  });

  describe('renderPublicPage', () => {
    test('should render a page without navigation', () => {
      const html = renderPublicPage('Public Page', '<p>Public Content</p>');
      expect(html).toContain('Public Page');
      expect(html).toContain('<p>Public Content</p>');
      expect(html).toContain('Pre-Trading Approval');
    });

    test('should not include admin or employee navigation', () => {
      const html = renderPublicPage('Login', 'Content');
      expect(html).not.toContain('admin-dashboard');
      expect(html).not.toContain('employee-dashboard');
    });
  });

  describe('generateNotificationBanner', () => {
    test('should return empty string for null query', () => {
      expect(generateNotificationBanner(null)).toBe('');
    });

    test('should return empty string for undefined query', () => {
      expect(generateNotificationBanner(undefined)).toBe('');
    });

    test('should return empty string for empty query object', () => {
      expect(generateNotificationBanner({})).toBe('');
    });

    describe('success messages', () => {
      test('should render stock_added message', () => {
        const html = generateNotificationBanner({ message: 'stock_added' });
        expect(html).toContain('alert-success');
        expect(html).toContain('Stock added successfully');
      });

      test('should render stock_added with ticker and company details', () => {
        const html = generateNotificationBanner({
          message: 'stock_added',
          ticker: 'AAPL',
          company: 'Apple%20Inc'
        });
        expect(html).toContain('alert-success');
        expect(html).toContain('AAPL');
        expect(html).toContain('Apple Inc');
      });

      test('should render stock_removed message', () => {
        const html = generateNotificationBanner({ message: 'stock_removed' });
        expect(html).toContain('alert-success');
        expect(html).toContain('Stock removed successfully');
      });

      test('should render request_approved message', () => {
        const html = generateNotificationBanner({ message: 'request_approved' });
        expect(html).toContain('alert-success');
        expect(html).toContain('Trading request approved successfully');
      });

      test('should render request_rejected message', () => {
        const html = generateNotificationBanner({ message: 'request_rejected' });
        expect(html).toContain('alert-success');
        expect(html).toContain('Trading request rejected');
      });

      test('should render escalation_submitted message', () => {
        const html = generateNotificationBanner({ message: 'escalation_submitted' });
        expect(html).toContain('alert-success');
        expect(html).toContain('Escalation submitted successfully');
      });

      test('should render admin_logged_out message', () => {
        const html = generateNotificationBanner({ message: 'admin_logged_out' });
        expect(html).toContain('alert-success');
        expect(html).toContain('logged out successfully');
      });

      test('should render database_cleared message', () => {
        const html = generateNotificationBanner({ message: 'database_cleared' });
        expect(html).toContain('alert-success');
        expect(html).toContain('Database successfully reset');
      });

      test('should render statement_emails_sent message', () => {
        const html = generateNotificationBanner({ message: 'statement_emails_sent' });
        expect(html).toContain('alert-success');
        expect(html).toContain('statement request emails have been sent');
      });

      test('should render statement_email_resent message', () => {
        const html = generateNotificationBanner({ message: 'statement_email_resent' });
        expect(html).toContain('alert-success');
        expect(html).toContain('Statement request email has been resent');
      });

      test('should render statement_uploaded message', () => {
        const html = generateNotificationBanner({ message: 'statement_uploaded' });
        expect(html).toContain('alert-success');
        expect(html).toContain('Trading statement uploaded successfully');
      });

      test('should render accounts_confirmed message', () => {
        const html = generateNotificationBanner({ message: 'accounts_confirmed' });
        expect(html).toContain('alert-success');
        expect(html).toContain('brokerage accounts have been confirmed');
      });

      test('should decode custom message strings', () => {
        const html = generateNotificationBanner({ message: 'Custom%20success%20message' });
        expect(html).toContain('alert-success');
        expect(html).toContain('Custom success message');
      });
    });

    describe('error messages', () => {
      test('should render authentication_required error', () => {
        const html = generateNotificationBanner({ error: 'authentication_required' });
        expect(html).toContain('alert-error');
        expect(html).toContain('Authentication required');
      });

      test('should render invalid_credentials error', () => {
        const html = generateNotificationBanner({ error: 'invalid_credentials' });
        expect(html).toContain('alert-error');
        expect(html).toContain('Invalid username or password');
      });

      test('should render invalid_ticker error without ticker', () => {
        const html = generateNotificationBanner({ error: 'invalid_ticker' });
        expect(html).toContain('alert-error');
        expect(html).toContain('Invalid ticker format');
      });

      test('should render invalid_ticker error with ticker detail', () => {
        const html = generateNotificationBanner({ error: 'invalid_ticker', ticker: 'XYZ123' });
        expect(html).toContain('alert-error');
        expect(html).toContain('XYZ123');
      });

      test('should render stock_already_exists error', () => {
        const html = generateNotificationBanner({ error: 'stock_already_exists', ticker: 'AAPL' });
        expect(html).toContain('alert-error');
        expect(html).toContain('already in the restricted list');
        expect(html).toContain('AAPL');
      });

      test('should render stock_already_exists error without ticker', () => {
        const html = generateNotificationBanner({ error: 'stock_already_exists' });
        expect(html).toContain('alert-error');
        expect(html).toContain('already in the restricted list');
      });

      test('should render ticker_required error', () => {
        const html = generateNotificationBanner({ error: 'ticker_required' });
        expect(html).toContain('alert-error');
        expect(html).toContain('Stock ticker is required');
      });

      test('should render add_failed error without details', () => {
        const html = generateNotificationBanner({ error: 'add_failed' });
        expect(html).toContain('alert-error');
        expect(html).toContain('Failed to add stock');
      });

      test('should render add_failed error with details', () => {
        const html = generateNotificationBanner({ error: 'add_failed', details: 'Duplicate%20entry' });
        expect(html).toContain('alert-error');
        expect(html).toContain('Failed to add stock');
        expect(html).toContain('Duplicate entry');
      });

      test('should render export_failed error', () => {
        const html = generateNotificationBanner({ error: 'export_failed' });
        expect(html).toContain('alert-error');
        expect(html).toContain('Failed to export trading history');
      });

      test('should decode custom error strings', () => {
        const html = generateNotificationBanner({ error: 'Custom%20error%20message' });
        expect(html).toContain('alert-error');
        expect(html).toContain('Custom error message');
      });
    });

    test('should include role="alert" attribute', () => {
      const html = generateNotificationBanner({ message: 'stock_added' });
      expect(html).toContain('role="alert"');
    });

    test('should return empty string when query has keys but no message/error', () => {
      const html = generateNotificationBanner({ page: '1', sort: 'asc' });
      expect(html).toBe('');
    });

    test('should prioritize error over message when both present', () => {
      // Both message and error are present: message sets the banner first,
      // then error overwrites it. The final type should be 'error'.
      const html = generateNotificationBanner({
        message: 'stock_added',
        error: 'authentication_required'
      });
      expect(html).toContain('alert-error');
      expect(html).toContain('Authentication required');
    });
  });

  describe('renderCard', () => {
    test('should render a card with title and content', () => {
      const html = renderCard('Card Title', '<p>Card body</p>');

      expect(html).toContain('class="card');
      expect(html).toContain('card-header');
      expect(html).toContain('card-title');
      expect(html).toContain('Card Title');
      expect(html).toContain('card-body');
      expect(html).toContain('<p>Card body</p>');
    });

    test('should render subtitle when provided', () => {
      const html = renderCard('Title', 'Content', 'A helpful subtitle');
      expect(html).toContain('A helpful subtitle');
      expect(html).toContain('text-muted');
    });

    test('should not render subtitle element when not provided', () => {
      const html = renderCard('Title', 'Content');
      expect(html).not.toContain('text-muted');
    });

    test('should not render subtitle element for empty string', () => {
      const html = renderCard('Title', 'Content', '');
      expect(html).not.toContain('text-muted');
    });

    test('should handle HTML content inside card body', () => {
      const content = '<form><input type="text" name="test" /></form>';
      const html = renderCard('Form Card', content);
      expect(html).toContain(content);
    });

    test('should include mb-6 margin class', () => {
      const html = renderCard('Title', 'Content');
      expect(html).toContain('mb-6');
    });
  });

  describe('renderTable', () => {
    test('should render a table with headers and rows', () => {
      const headers = ['Name', 'Age', 'City'];
      const rows = [
        '<tr><td>Alice</td><td>30</td><td>NYC</td></tr>',
        '<tr><td>Bob</td><td>25</td><td>LA</td></tr>'
      ];
      const html = renderTable(headers, rows);

      expect(html).toContain('modern-table');
      expect(html).toContain('<th>Name</th>');
      expect(html).toContain('<th>Age</th>');
      expect(html).toContain('<th>City</th>');
      expect(html).toContain('<td>Alice</td>');
      expect(html).toContain('<td>Bob</td>');
    });

    test('should render empty message when rows array is empty', () => {
      const headers = ['Name', 'Status'];
      const html = renderTable(headers, []);

      expect(html).toContain('No data found');
      expect(html).toContain(`colspan="2"`);
    });

    test('should use custom empty message when provided', () => {
      const headers = ['Ticker', 'Price'];
      const html = renderTable(headers, [], 'No stocks available');

      expect(html).toContain('No stocks available');
      expect(html).not.toContain('No data found');
    });

    test('should render correct colspan for empty table', () => {
      const headers = ['A', 'B', 'C', 'D', 'E'];
      const html = renderTable(headers, []);

      expect(html).toContain(`colspan="5"`);
    });

    test('should wrap table in a table-container div', () => {
      const html = renderTable(['Header'], ['<tr><td>Data</td></tr>']);
      expect(html).toContain('table-container');
    });

    test('should render thead and tbody sections', () => {
      const html = renderTable(['H1'], ['<tr><td>D1</td></tr>']);
      expect(html).toContain('<thead>');
      expect(html).toContain('</thead>');
      expect(html).toContain('<tbody>');
      expect(html).toContain('</tbody>');
    });

    test('should handle single header and single row', () => {
      const html = renderTable(['Status'], ['<tr><td>Active</td></tr>']);
      expect(html).toContain('<th>Status</th>');
      expect(html).toContain('<td>Active</td>');
    });

    test('should handle many rows', () => {
      const headers = ['ID'];
      const rows = Array.from({ length: 100 }, (_, i) => `<tr><td>${i + 1}</td></tr>`);
      const html = renderTable(headers, rows);

      expect(html).toContain('<td>1</td>');
      expect(html).toContain('<td>50</td>');
      expect(html).toContain('<td>100</td>');
    });

    test('should apply text-center and text-muted classes to empty state', () => {
      const html = renderTable(['Col'], []);
      expect(html).toContain('text-center');
      expect(html).toContain('text-muted');
    });

    test('should handle headers with special characters', () => {
      const headers = ['Price ($)', 'Change (%)', 'Notes & Comments'];
      const html = renderTable(headers, []);

      expect(html).toContain('<th>Price ($)</th>');
      expect(html).toContain('<th>Change (%)</th>');
      expect(html).toContain('<th>Notes & Comments</th>');
    });
  });
});
