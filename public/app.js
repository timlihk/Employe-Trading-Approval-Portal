class TradingApp {
    constructor() {
        this.currentSection = 'employee';
        this.isAuthenticated = false;
        this.isEmployeeAuthenticated = false;
        this.employeeInfo = null;
        this.init();
    }

    escapeHtml(text) {
        const map = {
            '&': '&amp;',
            '<': '&lt;',
            '>': '&gt;',
            '"': '&quot;',
            "'": '&#039;'
        };
        return text ? text.toString().replace(/[&<>"']/g, m => map[m]) : '';
    }

    init() {
        this.bindEvents();
        this.checkAuthStatus();
        this.checkEmployeeAuthStatus();
        this.loadRestrictedStocks();
        this.loadRequestHistory();
        this.handleUrlParams();
    }

    bindEvents() {
        document.getElementById('employeeTab').addEventListener('click', () => this.showSection('employee'));
        document.getElementById('adminTab').addEventListener('click', () => this.showSection('admin'));
        document.getElementById('historyTab').addEventListener('click', () => this.showSection('history'));

        document.getElementById('tradingForm').addEventListener('submit', (e) => this.handleTradingSubmit(e));
        document.getElementById('addStockForm').addEventListener('submit', (e) => this.handleAddStock(e));
        document.getElementById('new_ticker').addEventListener('input', (e) => this.handleNewStockTicker(e));
        document.getElementById('loginForm').addEventListener('submit', (e) => this.handleLogin(e));
        document.getElementById('logoutBtn').addEventListener('click', () => this.handleLogout());
        document.getElementById('microsoftLoginBtn').addEventListener('click', () => this.handleMicrosoftLogin());
        document.getElementById('employeeLogoutBtn').addEventListener('click', () => this.handleEmployeeLogout());
        document.getElementById('searchHistory').addEventListener('click', () => this.searchSubmissionHistory());
        document.getElementById('exportHistory').addEventListener('click', () => this.exportHistoryCSV());
        document.getElementById('generateComplianceReport').addEventListener('click', () => this.generateComplianceReport());
        document.getElementById('performDataCleanup').addEventListener('click', () => this.performDataCleanup());
        document.getElementById('exportAuditLogs').addEventListener('click', () => this.exportAuditLogs());
        document.getElementById('searchAuditLogs').addEventListener('click', () => this.searchAuditLogs());
        document.getElementById('exportRestrictedListChangelog').addEventListener('click', () => this.exportRestrictedListChangelog());
        document.getElementById('searchRestrictedChangelog').addEventListener('click', () => this.searchRestrictedChangelog());
        
        // Stock ticker validation
        document.getElementById('ticker').addEventListener('input', (e) => this.handleTickerInput(e));
        document.getElementById('shares').addEventListener('input', () => this.checkAndDisplayStockInfo());
        
        // Handle trading type buttons
        document.querySelectorAll('.trading-type-btn').forEach(btn => {
            btn.addEventListener('click', (e) => this.handleTradingTypeSelection(e));
        });
        
        // Dashboard navigation
        document.addEventListener('click', (e) => {
            if (e.target.closest('.dashboard-card')) {
                const card = e.target.closest('.dashboard-card');
                const functionName = card.getAttribute('data-function');
                this.showAdminFunction(functionName);
            }
            if (e.target.classList.contains('back-to-dashboard')) {
                this.showAdminDashboard();
            }
        });
    }

    showSection(section) {
        document.querySelectorAll('.section').forEach(s => s.classList.remove('active'));
        document.querySelectorAll('.tab-button').forEach(b => b.classList.remove('active'));

        document.getElementById(`${section}Section`).classList.add('active');
        document.getElementById(`${section}Tab`).classList.add('active');

        this.currentSection = section;

        if (section === 'employee') {
            this.handleEmployeeSection();
        } else if (section === 'admin') {
            this.handleAdminSection();
        } else if (section === 'history') {
            this.loadRequestHistory();
        }
    }



    async loadRequestHistory() {
        const container = document.getElementById('requestHistory');
        container.innerHTML = '<div class="loading">Loading...</div>';

        try {
            const response = await fetch('/api/trading/requests');
            const result = await response.json();

            if (result.success) {
                this.renderRequestHistory(result.data);
            } else {
                container.innerHTML = '<div class="error">Error loading request history</div>';
            }
        } catch (error) {
            console.error('Error loading request history:', error);
            container.innerHTML = '<div class="error">Network error loading history</div>';
        }
    }

    renderRestrictedStocks(stocks) {
        const container = document.getElementById('restrictedStocksList');
        
        if (stocks.length === 0) {
            container.innerHTML = '<tr class="loading-row"><td colspan="4" class="loading-cell">No restricted stocks found</td></tr>';
            return;
        }

        container.innerHTML = stocks.map(stock => `
            <tr>
                <td class="table-ticker">${this.escapeHtml(stock.ticker)}</td>
                <td class="table-employee">${this.escapeHtml(stock.company_name)}</td>
                <td class="table-employee">${this.escapeHtml(stock.exchange || 'N/A')}</td>
                <td>
                    <button class="btn btn-danger btn-sm remove-stock-btn" data-ticker="${stock.ticker}">
                        Remove
                    </button>
                </td>
            </tr>
        `).join('');

        // Add event listeners to remove buttons
        container.querySelectorAll('.remove-stock-btn').forEach(button => {
            button.addEventListener('click', (e) => {
                const ticker = e.target.getAttribute('data-ticker');
                console.log('Remove button clicked for ticker:', ticker);
                this.removeStock(ticker);
            });
        });
    }

    renderRequestHistory(requests) {
        const container = document.getElementById('requestHistory');
        
        if (requests.length === 0) {
            container.innerHTML = '<tr class="loading-row"><td colspan="8" class="loading-cell">No requests found</td></tr>';
            return;
        }

        container.innerHTML = requests.map(request => {
            const sharePrice = request.share_price ? `$${parseFloat(request.share_price).toFixed(2)}` : 'N/A';
            const totalValue = request.total_value ? `$${parseFloat(request.total_value).toLocaleString()}` : 'N/A';
            const formattedDate = new Date(request.created_at).toLocaleDateString('en-US', {
                year: 'numeric',
                month: 'short',
                day: 'numeric'
            });
            const formattedTime = new Date(request.created_at).toLocaleTimeString('en-US', {
                hour: '2-digit',
                minute: '2-digit'
            });
            
            return `
                <tr>
                    <td class="table-id">${request.id || 'N/A'}</td>
                    <td class="table-date">
                        <div>${formattedDate}</div>
                        <div style="font-size: var(--font-size-sm); color: var(--gs-neutral-500);">${formattedTime}</div>
                    </td>
                    <td class="table-employee">${this.escapeHtml(request.employee_email)}</td>
                    <td class="table-stock">
                        <div class="table-ticker">${this.escapeHtml(request.ticker)}</div>
                        <div class="table-company">${this.escapeHtml(request.stock_name || 'Unknown')}</div>
                    </td>
                    <td class="table-action ${request.trading_type}">${request.trading_type.toUpperCase()}</td>
                    <td class="table-shares">${request.shares.toLocaleString()}</td>
                    <td class="table-value">
                        <div class="table-value-primary">${totalValue}</div>
                        <div class="table-value-secondary">@ ${sharePrice}</div>
                    </td>
                    <td><span class="table-status ${request.status}">${request.status.toUpperCase()}</span></td>
                </tr>
            `;
        }).join('');
    }

    showResult(result, isSuccess) {
        const resultDiv = document.getElementById('requestResult');
        resultDiv.style.display = 'block';
        resultDiv.className = `result-card ${isSuccess && result.success ? 'success' : 'error'}`;
        
        let content = `<h3>${result.success ? '✅ Success' : '❌ Error'}</h3>`;
        
        if (result.data && result.data.message) {
            content += `<p>${result.data.message}</p>`;
        } else if (result.message) {
            content += `<p>${result.message}</p>`;
        }
        
        if (result.errors) {
            content += '<ul>';
            result.errors.forEach(error => {
                content += `<li>${error.msg}</li>`;
            });
            content += '</ul>';
        }

        resultDiv.innerHTML = content;

        setTimeout(() => {
            resultDiv.style.display = 'none';
        }, 10000);
    }

    showNotification(message, type) {
        const notification = document.createElement('div');
        notification.className = `notification ${type}`;
        notification.textContent = message;
        notification.style.cssText = `
            position: fixed;
            top: 20px;
            right: 20px;
            padding: 15px 20px;
            border-radius: 5px;
            color: white;
            font-weight: bold;
            z-index: 1000;
            background: ${type === 'success' ? '#28a745' : '#dc3545'};
        `;

        document.body.appendChild(notification);

        setTimeout(() => {
            notification.remove();
        }, 5000);
    }

    async checkAuthStatus() {
        try {
            const response = await fetch('/api/auth/check', {
                credentials: 'include'
            });
            const result = await response.json();
            
            if (result.success && result.authenticated) {
                this.isAuthenticated = true;
            } else {
                this.isAuthenticated = false;
            }
        } catch (error) {
            console.error('Auth check error:', error);
            this.isAuthenticated = false;
        }
    }

    handleAdminSection() {
        if (this.isAuthenticated) {
            document.getElementById('adminLogin').style.display = 'none';
            document.getElementById('adminPanel').style.display = 'block';
            this.showAdminDashboard(); // Show dashboard by default
        } else {
            document.getElementById('adminLogin').style.display = 'block';
            document.getElementById('adminPanel').style.display = 'none';
        }
    }

    async handleLogin(e) {
        e.preventDefault();
        
        const formData = new FormData(e.target);
        const data = Object.fromEntries(formData.entries());

        try {
            const response = await fetch('/api/auth/login', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                credentials: 'include',
                body: JSON.stringify(data)
            });

            const result = await response.json();

            if (result.success) {
                this.isAuthenticated = true;
                this.handleAdminSection();
                e.target.reset();
                document.getElementById('loginError').style.display = 'none';
                this.showNotification('Login successful', 'success');
            } else {
                const errorDiv = document.getElementById('loginError');
                errorDiv.textContent = result.message || 'Login failed';
                errorDiv.style.display = 'block';
            }
        } catch (error) {
            console.error('Login error:', error);
            const errorDiv = document.getElementById('loginError');
            errorDiv.textContent = 'Network error. Please try again.';
            errorDiv.style.display = 'block';
        }
    }

    async handleLogout() {
        try {
            const response = await fetch('/api/auth/logout', {
                method: 'POST',
                credentials: 'include'
            });

            const result = await response.json();

            if (result.success) {
                this.isAuthenticated = false;
                this.handleAdminSection();
                this.showNotification('Logged out successfully', 'success');
            } else {
                this.showNotification('Logout failed', 'error');
            }
        } catch (error) {
            console.error('Logout error:', error);
            this.showNotification('Network error during logout', 'error');
        }
    }

    async loadRestrictedStocks() {
        const container = document.getElementById('restrictedStocksList');
        container.innerHTML = '<div class="loading">Loading...</div>';

        try {
            const response = await fetch('/api/restricted-stocks', {
                credentials: 'include'
            });
            const result = await response.json();

            if (result.success) {
                this.renderRestrictedStocks(result.data);
            } else {
                container.innerHTML = '<div class="error">Error loading restricted stocks</div>';
            }
        } catch (error) {
            console.error('Error loading restricted stocks:', error);
            container.innerHTML = '<div class="error">Network error loading stocks</div>';
        }
    }

    async handleAddStock(e) {
        e.preventDefault();
        
        const ticker = document.getElementById('new_ticker').value.trim();
        
        if (!ticker) {
            this.showNotification('Please enter a ticker symbol', 'error');
            return;
        }
        
        // If no validated stock data, try to validate now
        if (!this.newStockData || !this.newStockData.success) {
            this.showNotification('Validating ticker, please wait...', 'info');
            await this.validateNewStock(ticker);
            
            // Check again after validation
            if (!this.newStockData || !this.newStockData.success) {
                this.showNotification('Please enter a valid ticker symbol', 'error');
                return;
            }
        }
        
        const company_name = this.newStockData.company_name;
        const exchange = this.newStockData.exchange;

        try {
            const response = await fetch('/api/restricted-stocks', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                credentials: 'include',
                body: JSON.stringify({ ticker, company_name, exchange })
            });

            const result = await response.json();

            if (result.success) {
                e.target.reset();
                document.getElementById('newStockStatus').style.display = 'none';
                document.getElementById('newStockInfo').style.display = 'none';
                this.newStockData = null;
                this.loadRestrictedStocks();
                this.showNotification('Stock added to restricted trading list successfully', 'success');
            } else if (result.requiresLogin) {
                this.isAuthenticated = false;
                this.handleAdminSection();
                this.showNotification('Please log in again', 'error');
            } else {
                this.showNotification(result.message || 'Error adding stock', 'error');
            }
        } catch (error) {
            console.error('Error adding stock:', error);
            this.showNotification('Network error. Please try again.', 'error');
        }
    }

    async removeStock(ticker) {
        if (!confirm(`Are you sure you want to remove ${ticker} from the restricted list?`)) {
            return;
        }

        try {
            const response = await fetch(`/api/restricted-stocks/${ticker}`, {
                method: 'DELETE',
                credentials: 'include'
            });

            const result = await response.json();

            if (result.success) {
                this.loadRestrictedStocks();
                this.showNotification('Stock removed successfully', 'success');
            } else if (result.requiresLogin) {
                this.isAuthenticated = false;
                this.handleAdminSection();
                this.showNotification('Please log in again', 'error');
            } else {
                this.showNotification(result.message || 'Error removing stock', 'error');
            }
        } catch (error) {
            console.error('Error removing stock:', error);
            this.showNotification('Network error. Please try again.', 'error');
        }
    }

    async checkEmployeeAuthStatus() {
        try {
            const response = await fetch('/api/auth/employee/check', {
                credentials: 'include'
            });
            const result = await response.json();
            
            if (result.success && result.authenticated) {
                this.isEmployeeAuthenticated = true;
                this.employeeInfo = {
                    email: result.email,
                    name: result.name
                };
            } else {
                this.isEmployeeAuthenticated = false;
                this.employeeInfo = null;
            }
        } catch (error) {
            console.error('Employee auth check error:', error);
            this.isEmployeeAuthenticated = false;
            this.employeeInfo = null;
        }
    }

    handleEmployeeSection() {
        if (this.isEmployeeAuthenticated && this.employeeInfo) {
            document.getElementById('employeeLogin').style.display = 'none';
            document.getElementById('employeeForm').style.display = 'block';
            document.getElementById('employeeWelcome').textContent = `Welcome, ${this.employeeInfo.name} (${this.employeeInfo.email})`;
        } else {
            document.getElementById('employeeLogin').style.display = 'block';
            document.getElementById('employeeForm').style.display = 'none';
        }
    }

    async handleMicrosoftLogin() {
        try {
            const response = await fetch('/api/auth/microsoft/login', {
                credentials: 'include'
            });
            const result = await response.json();

            if (result.success && result.authUrl) {
                // Redirect to Microsoft 365 login
                window.location.href = result.authUrl;
            } else if (result.configurationRequired) {
                this.showNotification('Microsoft 365 authentication is not configured. Please contact your administrator to set up Azure credentials.', 'error');
            } else {
                this.showNotification(result.message || 'Failed to initiate Microsoft login', 'error');
            }
        } catch (error) {
            console.error('Microsoft login error:', error);
            this.showNotification('Network error during Microsoft login', 'error');
        }
    }

    async handleEmployeeLogout() {
        try {
            const response = await fetch('/api/auth/employee/logout', {
                method: 'POST',
                credentials: 'include'
            });

            const result = await response.json();

            if (result.success) {
                this.isEmployeeAuthenticated = false;
                this.employeeInfo = null;
                this.handleEmployeeSection();
                this.showNotification('Logged out successfully', 'success');
            } else {
                this.showNotification('Logout failed', 'error');
            }
        } catch (error) {
            console.error('Employee logout error:', error);
            this.showNotification('Network error during logout', 'error');
        }
    }

    async handleTradingSubmit(e) {
        e.preventDefault();
        
        if (!this.isEmployeeAuthenticated) {
            this.showNotification('Please login with Microsoft 365 first', 'error');
            return;
        }
        
        // Check compliance agreement checkbox
        const complianceCheckbox = document.getElementById('complianceAgreement');
        if (!complianceCheckbox.checked) {
            this.showNotification('Please read and agree to the compliance declaration', 'error');
            complianceCheckbox.focus();
            return;
        }
        
        const formData = new FormData(e.target);
        const data = Object.fromEntries(formData.entries());

        try {
            const response = await fetch('/api/trading/submit', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                credentials: 'include',
                body: JSON.stringify(data)
            });

            const result = await response.json();
            
            if (result.requiresLogin) {
                this.isEmployeeAuthenticated = false;
                this.employeeInfo = null;
                this.handleEmployeeSection();
                this.showNotification('Please login again with Microsoft 365', 'error');
                return;
            }

            if (result.configurationRequired) {
                this.showNotification('Microsoft 365 authentication is not configured. Please contact your administrator.', 'error');
                return;
            }
            
            this.showResult(result, response.ok);

            if (result.success) {
                e.target.reset();
            }
        } catch (error) {
            console.error('Error submitting request:', error);
            this.showResult({ 
                success: false, 
                message: 'Network error. Please try again.' 
            }, false);
        }
    }

    handleUrlParams() {
        const urlParams = new URLSearchParams(window.location.search);
        const loginSuccess = urlParams.get('login');
        const tab = urlParams.get('tab');

        if (loginSuccess === 'success') {
            // Clear the URL parameters
            window.history.replaceState({}, document.title, window.location.pathname);
            
            // Show success notification
            setTimeout(() => {
                this.showNotification('Successfully logged in with Microsoft 365!', 'success');
            }, 500);

            // Force employee section to show after authentication check completes
            setTimeout(() => {
                this.showSection('employee');
            }, 1000);
        } else if (tab) {
            // Show specific tab if requested in URL
            setTimeout(() => {
                this.showSection(tab);
            }, 500);
        }
    }

    async loadTeamMembers() {
        try {
            const response = await fetch('/api/inquiry/team-members', {
                credentials: 'include'
            });
            const result = await response.json();

            if (result.success) {
                const select = document.getElementById('teamMemberSelect');
                // Clear existing options except "All Team Members"
                select.innerHTML = '<option value="all">All Team Members</option>';
                
                result.data.forEach(email => {
                    const option = document.createElement('option');
                    option.value = email;
                    option.textContent = email;
                    select.appendChild(option);
                });
            }
        } catch (error) {
            console.error('Error loading team members:', error);
        }
    }

    async searchSubmissionHistory() {
        const employeeEmail = document.getElementById('teamMemberSelect').value;
        const startDate = document.getElementById('startDate').value;
        const endDate = document.getElementById('endDate').value;

        const params = new URLSearchParams();
        if (employeeEmail && employeeEmail !== 'all') {
            params.append('employee_email', employeeEmail);
        }
        if (startDate) {
            params.append('start_date', startDate);
        }
        if (endDate) {
            params.append('end_date', endDate);
        }

        try {
            const response = await fetch(`/api/inquiry/submission-history?${params.toString()}`, {
                credentials: 'include'
            });
            const result = await response.json();

            if (result.success) {
                this.displayInquiryResults(result.data);
            } else if (result.requiresLogin) {
                this.isAuthenticated = false;
                this.handleAdminSection();
                this.showNotification('Please log in again', 'error');
            } else {
                this.showNotification(result.message || 'Error searching history', 'error');
            }
        } catch (error) {
            console.error('Error searching history:', error);
            this.showNotification('Network error during search', 'error');
        }
    }

    displayInquiryResults(data) {
        const { history, summary } = data;

        // Update summary
        document.getElementById('totalRequests').textContent = summary.total_requests || 0;
        document.getElementById('approvedCount').textContent = summary.approved_count || 0;
        document.getElementById('rejectedCount').textContent = summary.rejected_count || 0;
        document.getElementById('pendingCount').textContent = summary.pending_count || 0;
        document.getElementById('buyShares').textContent = (summary.total_buy_shares || 0).toLocaleString();
        document.getElementById('sellShares').textContent = (summary.total_sell_shares || 0).toLocaleString();
        document.getElementById('buyValue').textContent = `$${(summary.total_buy_value || 0).toLocaleString()}`;
        document.getElementById('sellValue').textContent = `$${(summary.total_sell_value || 0).toLocaleString()}`;

        // Show summary
        document.getElementById('inquirySummary').style.display = 'block';

        // Display history using the same table format as Request History
        const container = document.getElementById('inquiryResultsList');
        
        if (history.length === 0) {
            container.innerHTML = '<tr class="loading-row"><td colspan="8" class="loading-cell">No requests found for the selected criteria</td></tr>';
        } else {
            container.innerHTML = history.map(request => {
                const sharePrice = request.share_price ? `$${parseFloat(request.share_price).toFixed(2)}` : 'N/A';
                const totalValue = request.total_value ? `$${parseFloat(request.total_value).toLocaleString()}` : 'N/A';
                const formattedDate = new Date(request.created_at).toLocaleDateString('en-US', {
                    year: 'numeric',
                    month: 'short',
                    day: 'numeric'
                });
                const formattedTime = new Date(request.created_at).toLocaleTimeString('en-US', {
                    hour: '2-digit',
                    minute: '2-digit'
                });
                
                return `
                    <tr>
                        <td class="table-id">${request.id || 'N/A'}</td>
                        <td class="table-date">
                            <div>${formattedDate}</div>
                            <div style="font-size: var(--font-size-sm); color: var(--gs-neutral-500);">${formattedTime}</div>
                        </td>
                        <td class="table-employee">${this.escapeHtml(request.employee_email)}</td>
                        <td class="table-stock">
                            <div class="table-ticker">${this.escapeHtml(request.ticker)}</div>
                            <div class="table-company">${this.escapeHtml(request.stock_name || 'Unknown')}</div>
                        </td>
                        <td class="table-action ${request.trading_type}">${request.trading_type.toUpperCase()}</td>
                        <td class="table-shares">${request.shares.toLocaleString()}</td>
                        <td class="table-value">
                            <div class="table-value-primary">${totalValue}</div>
                            <div class="table-value-secondary">@ ${sharePrice}</div>
                        </td>
                        <td><span class="table-status ${request.status}">${request.status.toUpperCase()}</span></td>
                    </tr>
                `;
            }).join('');
        }

        // Show results
        document.getElementById('inquiryResults').style.display = 'block';
    }

    async exportHistoryCSV() {
        const employeeEmail = document.getElementById('teamMemberSelect').value;
        const startDate = document.getElementById('startDate').value;
        const endDate = document.getElementById('endDate').value;

        const params = new URLSearchParams();
        if (employeeEmail && employeeEmail !== 'all') {
            params.append('employee_email', employeeEmail);
        }
        if (startDate) {
            params.append('start_date', startDate);
        }
        if (endDate) {
            params.append('end_date', endDate);
        }

        try {
            const response = await fetch(`/api/inquiry/submission-history?${params.toString()}`, {
                credentials: 'include'
            });
            const result = await response.json();

            if (result.success) {
                this.downloadCSV(result.data.history);
            } else {
                this.showNotification('Error exporting data', 'error');
            }
        } catch (error) {
            console.error('Error exporting CSV:', error);
            this.showNotification('Network error during export', 'error');
        }
    }

    downloadCSV(data) {
        if (data.length === 0) {
            this.showNotification('No data to export', 'error');
            return;
        }

        const headers = ['ID', 'Employee Email', 'Stock Name', 'Ticker', 'Shares', 'Trading Type', 'Status', 'Rejection Reason', 'Created At', 'Processed At'];
        
        const csvContent = [
            headers.join(','),
            ...data.map(row => [
                row.id,
                `"${row.employee_email}"`,
                `"${row.stock_name}"`,
                row.ticker,
                row.shares,
                row.trading_type,
                row.status,
                `"${row.rejection_reason || ''}"`,
                row.created_at,
                row.processed_at || ''
            ].join(','))
        ].join('\n');

        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        const link = document.createElement('a');
        const url = URL.createObjectURL(blob);
        
        link.setAttribute('href', url);
        link.setAttribute('download', `trading_requests_${new Date().toISOString().split('T')[0]}.csv`);
        link.style.visibility = 'hidden';
        
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);

        this.showNotification('CSV file downloaded successfully', 'success');
    }

    async loadComplianceSettings() {
        if (!this.isAuthenticated) return;

        const container = document.getElementById('complianceSettings');
        container.innerHTML = '<p class="loading">Loading compliance settings...</p>';

        try {
            const response = await fetch('/api/audit/compliance-settings', {
                credentials: 'include'
            });

            if (!response.ok) {
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }

            const result = await response.json();
            
            if (result.success) {
                this.displayComplianceSettings(result.data);
            } else {
                throw new Error(result.message || 'Failed to load settings');
            }
        } catch (error) {
            console.error('Error loading compliance settings:', error);
            container.innerHTML = `<p class="error-message">Error loading compliance settings: ${error.message}</p>`;
            this.showNotification('Failed to load compliance settings', 'error');
        }
    }

    displayComplianceSettings(settings) {
        const container = document.getElementById('complianceSettings');
        
        if (!settings || settings.length === 0) {
            container.innerHTML = `
                <p class="loading">No compliance settings found.</p>
                <p style="color: var(--gs-neutral-600); font-size: var(--font-size-sm); margin-top: 10px;">
                    The system should automatically initialize default compliance settings. 
                    If this persists, please check the database connection.
                </p>
            `;
            return;
        }

        // Store settings for editing
        this.currentSettings = settings;

        const settingsHtml = settings.map((setting, index) => {
            let displayKey = setting.setting_key.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
            let inputElement = '';
            
            // Create appropriate input based on setting type
            if (setting.setting_key.includes('retention_days')) {
                inputElement = `
                    <div class="setting-edit" style="display: none;">
                        <input type="number" 
                               id="edit_${setting.setting_key}" 
                               value="${setting.setting_value}" 
                               min="1" 
                               max="10000"
                               class="setting-input">
                        <span style="margin-left: 5px; color: #7f8c8d;">days</span>
                    </div>
                    <div class="setting-display">
                        ${setting.setting_value} days (${Math.round(parseInt(setting.setting_value) / 365)} years)
                    </div>
                `;
            } else if (setting.setting_key === 'max_trade_amount') {
                inputElement = `
                    <div class="setting-edit" style="display: none;">
                        <input type="number" 
                               id="edit_${setting.setting_key}" 
                               value="${setting.setting_value}" 
                               min="0" 
                               max="999999999"
                               class="setting-input">
                        <span style="margin-left: 5px; color: #7f8c8d;">USD</span>
                    </div>
                    <div class="setting-display">
                        $${parseInt(setting.setting_value).toLocaleString()}
                    </div>
                `;
            } else if (setting.setting_value === 'true' || setting.setting_value === 'false') {
                const isChecked = setting.setting_value === 'true' ? 'checked' : '';
                inputElement = `
                    <div class="setting-edit" style="display: none;">
                        <label class="switch">
                            <input type="checkbox" 
                                   id="edit_${setting.setting_key}" 
                                   ${isChecked}
                                   class="setting-checkbox">
                            <span class="slider"></span>
                        </label>
                    </div>
                    <div class="setting-display">
                        ${setting.setting_value === 'true' ? '✅ Enabled' : '❌ Disabled'}
                    </div>
                `;
            } else {
                inputElement = `
                    <div class="setting-edit" style="display: none;">
                        <input type="text" 
                               id="edit_${setting.setting_key}" 
                               value="${setting.setting_value}"
                               class="setting-input">
                    </div>
                    <div class="setting-display">
                        ${this.escapeHtml(setting.setting_value)}
                    </div>
                `;
            }
            
            return `
                <div class="setting-item" data-key="${setting.setting_key}">
                    <div class="setting-info">
                        <div class="setting-key">${this.escapeHtml(displayKey)}</div>
                        <div class="setting-description">${this.escapeHtml(setting.description || '')}</div>
                        <div style="font-size: var(--font-size-sm); color: var(--gs-neutral-500); margin-top: 5px;">
                            Last updated by: ${this.escapeHtml(setting.updated_by)} 
                            ${setting.updated_at ? `on ${new Date(setting.updated_at).toLocaleDateString()}` : ''}
                        </div>
                    </div>
                    <div class="setting-value">
                        ${inputElement}
                    </div>
                </div>
            `;
        }).join('');

        // Add edit mode controls
        const controlsHtml = `
            <div class="settings-controls" style="margin-top: 30px; padding-top: 20px; border-top: 1px solid #dee2e6;">
                <div id="editModeControls" style="display: flex; gap: 10px; justify-content: flex-end;">
                    <button id="editSettingsBtn" class="btn btn-primary">
                        Edit Settings
                    </button>
                </div>
                <div id="saveControls" style="display: none; flex-direction: column; gap: 15px;">
                    <div style="background: #fff3cd; padding: 10px; border-radius: 5px; border-left: 4px solid #ffc107;">
                        <strong>⚠️ Warning:</strong> Changes to compliance settings will affect system behavior immediately.
                    </div>
                    <div style="display: flex; gap: 10px; justify-content: flex-end;">
                        <button id="cancelSettingsBtn" class="btn btn-secondary">Cancel</button>
                        <button id="saveSettingsBtn" class="btn btn-primary">Save Changes</button>
                    </div>
                </div>
            </div>
        `;

        container.innerHTML = settingsHtml + controlsHtml;
        
        // Add event listeners after HTML is inserted
        const editBtn = document.getElementById('editSettingsBtn');
        const cancelBtn = document.getElementById('cancelSettingsBtn');
        const saveBtn = document.getElementById('saveSettingsBtn');
        
        if (editBtn) {
            editBtn.addEventListener('click', () => this.enterEditMode());
        }
        if (cancelBtn) {
            cancelBtn.addEventListener('click', () => this.cancelEdit());
        }
        if (saveBtn) {
            saveBtn.addEventListener('click', () => this.saveSettings());
        }
    }

    enterEditMode() {
        console.log('enterEditMode called');
        // Show all edit inputs
        const editElements = document.querySelectorAll('.setting-edit');
        const displayElements = document.querySelectorAll('.setting-display');
        console.log('Found edit elements:', editElements.length);
        console.log('Found display elements:', displayElements.length);
        
        editElements.forEach(el => el.style.display = 'flex');
        displayElements.forEach(el => el.style.display = 'none');
        
        // Toggle controls
        const editControls = document.getElementById('editModeControls');
        const saveControls = document.getElementById('saveControls');
        console.log('Edit controls:', editControls);
        console.log('Save controls:', saveControls);
        
        if (editControls) editControls.style.display = 'none';
        if (saveControls) saveControls.style.display = 'flex';
    }

    cancelEdit() {
        // Hide all edit inputs
        document.querySelectorAll('.setting-edit').forEach(el => el.style.display = 'none');
        document.querySelectorAll('.setting-display').forEach(el => el.style.display = 'block');
        
        // Toggle controls
        document.getElementById('editModeControls').style.display = 'flex';
        document.getElementById('saveControls').style.display = 'none';
        
        // Reset values to original
        if (this.currentSettings) {
            this.currentSettings.forEach(setting => {
                const input = document.getElementById(`edit_${setting.setting_key}`);
                if (input) {
                    if (input.type === 'checkbox') {
                        input.checked = setting.setting_value === 'true';
                    } else {
                        input.value = setting.setting_value;
                    }
                }
            });
        }
    }

    async saveSettings() {
        if (!this.currentSettings) return;
        
        const updates = [];
        
        // Collect changed values
        for (const setting of this.currentSettings) {
            const input = document.getElementById(`edit_${setting.setting_key}`);
            if (input) {
                let newValue;
                if (input.type === 'checkbox') {
                    newValue = input.checked ? 'true' : 'false';
                } else {
                    newValue = input.value;
                }
                
                if (newValue !== setting.setting_value) {
                    updates.push({
                        setting_key: setting.setting_key,
                        setting_value: newValue,
                        description: setting.description
                    });
                }
            }
        }
        
        if (updates.length === 0) {
            this.showNotification('No changes to save', 'info');
            this.cancelEdit();
            return;
        }
        
        // Save each updated setting
        try {
            for (const update of updates) {
                const response = await fetch('/api/audit/compliance-settings', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    credentials: 'include',
                    body: JSON.stringify(update)
                });
                
                if (!response.ok) {
                    throw new Error(`Failed to update ${update.setting_key}`);
                }
            }
            
            this.showNotification(`Successfully updated ${updates.length} setting(s)`, 'success');
            
            // Reload settings to show updated values
            this.loadComplianceSettings();
            
        } catch (error) {
            console.error('Error saving settings:', error);
            this.showNotification('Failed to save settings: ' + error.message, 'error');
        }
    }

    async generateComplianceReport() {
        if (!this.isAuthenticated) return;

        try {
            const response = await fetch('/api/audit/compliance-report?report_type=activity_summary', {
                credentials: 'include'
            });

            if (!response.ok) {
                throw new Error('Failed to generate compliance report');
            }

            const result = await response.json();
            this.showNotification('Compliance report generated successfully', 'success');
            
            // Download the report as JSON
            const blob = new Blob([JSON.stringify(result, null, 2)], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            const link = document.createElement('a');
            link.href = url;
            link.download = `compliance_report_${new Date().toISOString().split('T')[0]}.json`;
            link.click();
            URL.revokeObjectURL(url);
        } catch (error) {
            console.error('Error generating compliance report:', error);
            this.showNotification('Failed to generate compliance report', 'error');
        }
    }

    async performDataCleanup() {
        if (!this.isAuthenticated) return;

        if (!confirm('Are you sure you want to perform data retention cleanup? This will permanently delete old audit logs according to your retention policy.')) {
            return;
        }

        try {
            const response = await fetch('/api/audit/cleanup', {
                method: 'POST',
                credentials: 'include'
            });

            if (!response.ok) {
                throw new Error('Failed to perform data cleanup');
            }

            const result = await response.json();
            this.showNotification(result.message || 'Data cleanup completed successfully', 'success');
        } catch (error) {
            console.error('Error performing data cleanup:', error);
            this.showNotification('Failed to perform data cleanup', 'error');
        }
    }

    async exportAuditLogs() {
        if (!this.isAuthenticated) {
            this.showNotification('Please log in as admin first', 'error');
            return;
        }

        try {
            const userType = document.getElementById('auditUserType').value;
            const action = document.getElementById('auditAction').value;
            const startDate = document.getElementById('auditStartDate').value;
            const endDate = document.getElementById('auditEndDate').value;

            const params = new URLSearchParams({
                report_type: 'audit_logs',
                format: 'csv'
            });

            if (userType) params.append('user_type', userType);
            if (action) params.append('action', action);
            if (startDate) params.append('start_date', startDate);
            if (endDate) params.append('end_date', endDate);

            const response = await fetch(`/api/audit/export?${params.toString()}`, {
                credentials: 'include'
            });

            if (!response.ok) {
                const errorData = await response.text();
                throw new Error(`Failed to export audit logs: ${response.status} ${response.statusText}`);
            }

            const contentType = response.headers.get('content-type');
            if (contentType && contentType.includes('application/json')) {
                const errorData = await response.json();
                throw new Error(errorData.message || 'Server returned JSON instead of CSV');
            }

            const blob = await response.blob();
            const url = URL.createObjectURL(blob);
            const link = document.createElement('a');
            link.href = url;
            link.download = `audit_logs_${new Date().toISOString().split('T')[0]}.csv`;
            link.click();
            URL.revokeObjectURL(url);

            this.showNotification('Audit logs exported successfully', 'success');
        } catch (error) {
            console.error('Error exporting audit logs:', error);
            this.showNotification(`Failed to export audit logs: ${error.message}`, 'error');
        }
    }

    async searchAuditLogs() {
        if (!this.isAuthenticated) return;

        try {
            const userType = document.getElementById('auditUserType').value;
            const action = document.getElementById('auditAction').value;
            const startDate = document.getElementById('auditStartDate').value;
            const endDate = document.getElementById('auditEndDate').value;

            const params = new URLSearchParams({
                limit: '100'
            });

            if (userType) params.append('user_type', userType);
            if (action) params.append('action', action);
            if (startDate) params.append('start_date', startDate);
            if (endDate) params.append('end_date', endDate);

            const response = await fetch(`/api/audit/logs?${params.toString()}`, {
                credentials: 'include'
            });

            if (!response.ok) {
                throw new Error('Failed to search audit logs');
            }

            const result = await response.json();
            this.displayAuditLogs(result.data.logs);
            this.displayAuditSummary(result.data.summary);
        } catch (error) {
            console.error('Error searching audit logs:', error);
            this.showNotification('Failed to search audit logs', 'error');
        }
    }

    parseAuditDetails(log) {
        let item = 'N/A';
        let additionalInfo = 'N/A';
        
        // Parse the target_id as the main item
        if (log.target_id) {
            item = this.escapeHtml(log.target_id);
        }
        
        // Parse details JSON to extract meaningful information
        if (log.details) {
            try {
                const details = JSON.parse(log.details);
                const infoItems = [];
                
                // Handle different types of details based on action
                if (log.action.includes('login')) {
                    if (details.username) infoItems.push(`Username: ${details.username}`);
                    if (details.session_id) infoItems.push(`Session: ${details.session_id.substring(0, 8)}...`);
                    if (details.reason) infoItems.push(`Reason: ${details.reason}`);
                } else if (log.action.includes('stock')) {
                    if (details.ticker) infoItems.push(`Ticker: ${details.ticker}`);
                    if (details.company_name) infoItems.push(`Company: ${details.company_name}`);
                    if (details.exchange) infoItems.push(`Exchange: ${details.exchange}`);
                } else if (log.action.includes('trading_request')) {
                    if (details.trading_type) infoItems.push(`Type: ${details.trading_type.toUpperCase()}`);
                    if (details.shares) infoItems.push(`Shares: ${details.shares}`);
                    if (details.ticker) infoItems.push(`Ticker: ${details.ticker}`);
                } else if (log.action.includes('setting')) {
                    if (details.old_value) infoItems.push(`Old: ${details.old_value}`);
                    if (details.new_value) infoItems.push(`New: ${details.new_value}`);
                } else {
                    // Generic handling for other details
                    Object.keys(details).forEach(key => {
                        if (key !== 'session_id' && details[key] !== null && details[key] !== undefined) {
                            infoItems.push(`${key}: ${details[key]}`);
                        }
                    });
                }
                
                additionalInfo = infoItems.length > 0 ? infoItems.join(', ') : 'N/A';
            } catch (e) {
                // If it's not JSON, use as-is
                additionalInfo = this.escapeHtml(log.details);
            }
        }
        
        return { item, additionalInfo };
    }

    displayAuditLogs(logs) {
        const container = document.getElementById('auditLogsList');
        const resultsDiv = document.getElementById('auditResults');
        
        if (!logs || logs.length === 0) {
            container.innerHTML = '<tr class="loading-row"><td colspan="5" class="loading-cell">No audit logs found for the selected criteria.</td></tr>';
            resultsDiv.style.display = 'block';
            return;
        }

        const logsHtml = logs.map(log => {
            // Convert to Hong Kong timezone
            const hkDate = new Date(log.created_at);
            const formattedDate = hkDate.toLocaleDateString('en-US', {
                year: 'numeric',
                month: 'short',
                day: 'numeric',
                timeZone: 'Asia/Hong_Kong'
            });
            const formattedTime = hkDate.toLocaleTimeString('en-US', {
                hour: '2-digit',
                minute: '2-digit',
                timeZone: 'Asia/Hong_Kong'
            });
            
            const { item, additionalInfo } = this.parseAuditDetails(log);
            
            return `
                <tr>
                    <td class="table-date">
                        <div>${formattedDate}</div>
                        <div style="font-size: var(--font-size-sm); color: var(--gs-neutral-500);">${formattedTime} HKT</div>
                    </td>
                    <td class="table-employee">${this.escapeHtml(log.user_email)}</td>
                    <td class="table-action">${this.escapeHtml(log.action.replace(/_/g, ' ').toUpperCase())}</td>
                    <td class="table-employee">${item}</td>
                    <td class="table-employee">${additionalInfo}</td>
                </tr>
            `;
        }).join('');

        container.innerHTML = logsHtml;
        resultsDiv.style.display = 'block';
    }

    displayAuditSummary(summary) {
        if (!summary) return;

        document.getElementById('totalActivities').textContent = summary.total_activities || 0;
        document.getElementById('uniqueUsers').textContent = summary.unique_users || 0;
        document.getElementById('adminActivities').textContent = summary.admin_activities || 0;
        document.getElementById('employeeActivities').textContent = summary.employee_activities || 0;
        document.getElementById('loginActivities').textContent = summary.login_activities || 0;
        document.getElementById('createActivities').textContent = summary.create_activities || 0;

        document.getElementById('auditSummary').style.display = 'block';
    }

    showAdminFunction(functionName) {
        // Hide dashboard
        document.getElementById('adminDashboard').style.display = 'none';
        
        // Hide all content sections
        document.querySelectorAll('.admin-content-section').forEach(section => {
            section.style.display = 'none';
        });
        
        // Show selected function
        let sectionId;
        switch (functionName) {
            case 'stock-management':
                sectionId = 'stockManagementSection';
                this.loadRestrictedStocks(); // Load data when showing
                break;
            case 'team-inquiry':
                sectionId = 'teamInquirySection';
                this.loadTeamMembers(); // Load data when showing
                break;
            case 'audit-logs':
                sectionId = 'auditComplianceSection';
                break;
            case 'system-settings':
                sectionId = 'systemSettingsSection';
                this.loadComplianceSettings(); // Load data when showing
                break;
            default:
                return;
        }
        
        if (sectionId) {
            document.getElementById(sectionId).style.display = 'block';
        }
    }

    showAdminDashboard() {
        // Hide all content sections
        document.querySelectorAll('.admin-content-section').forEach(section => {
            section.style.display = 'none';
        });
        
        // Show dashboard
        document.getElementById('adminDashboard').style.display = 'block';
    }

    // Stock validation and calculation methods
    async handleTickerInput(e) {
        const ticker = e.target.value.trim().toUpperCase();
        const statusDiv = document.getElementById('tickerStatus');
        const stockInfoGroup = document.getElementById('stockInfoGroup');
        const tradeValueGroup = document.getElementById('tradeValueGroup');
        
        if (ticker.length === 0) {
            statusDiv.style.display = 'none';
            stockInfoGroup.style.display = 'none';
            tradeValueGroup.style.display = 'none';
            this.currentStockInfo = null;
            return;
        }

        if (ticker.length < 1 || ticker.length > 10) {
            return;
        }

        // Hide displays until both ticker and shares are provided
        stockInfoGroup.style.display = 'none';
        tradeValueGroup.style.display = 'none';

        // Debounce API calls
        clearTimeout(this.tickerTimeout);
        this.tickerTimeout = setTimeout(async () => {
            await this.validateAndFetchStock(ticker);
        }, 500);
    }

    async validateAndFetchStock(ticker) {
        const statusDiv = document.getElementById('tickerStatus');

        // Show loading state
        statusDiv.className = 'ticker-status loading';
        statusDiv.textContent = 'Validating ticker...';
        statusDiv.style.display = 'block';

        try {
            const response = await fetch(`/api/stock/info/${encodeURIComponent(ticker)}`);
            const result = await response.json();

            if (result.success) {
                // Valid ticker - just store the info and show validation
                statusDiv.className = 'ticker-status valid';
                statusDiv.textContent = `✓ Valid ticker: ${result.ticker}`;
                
                this.currentStockInfo = result;
                
                // Update form ticker field to uppercase
                document.getElementById('ticker').value = result.ticker;
                
                // Check if we should show info (both ticker and shares provided)
                this.checkAndDisplayStockInfo();
            } else {
                // Invalid ticker
                statusDiv.className = 'ticker-status invalid';
                statusDiv.textContent = `✗ Invalid ticker: ${result.error || 'Stock not found'}`;
                this.currentStockInfo = null;
                this.hideStockDisplays();
            }
        } catch (error) {
            console.error('Error validating ticker:', error);
            statusDiv.className = 'ticker-status invalid';
            statusDiv.textContent = '✗ Error validating ticker';
            this.currentStockInfo = null;
            this.hideStockDisplays();
        }
    }

    displayStockInfo(stockInfo) {
        const stockInfoDiv = document.getElementById('stockInfo');
        const lastUpdated = new Date(stockInfo.last_updated).toLocaleString();
        
        stockInfoDiv.innerHTML = `
            <div class="stock-info-item">
                <span class="stock-info-label">Company:</span>
                <span class="stock-info-value">${this.escapeHtml(stockInfo.company_name)}</span>
            </div>
            <div class="stock-info-item">
                <span class="stock-info-label">Current Price:</span>
                <span class="stock-info-value stock-price">$${stockInfo.current_price.toFixed(2)}</span>
            </div>
            <div class="stock-info-item">
                <span class="stock-info-label">Exchange:</span>
                <span class="stock-info-value">${stockInfo.exchange}</span>
            </div>
            <div class="stock-info-item">
                <span class="stock-info-label">Currency:</span>
                <span class="stock-info-value">${stockInfo.currency}</span>
            </div>
            <div class="stock-info-item">
                <span class="stock-info-label">Last Updated:</span>
                <span class="stock-info-value">${lastUpdated}</span>
            </div>
        `;
    }

    // Check if both ticker and shares are provided, then show stock info
    checkAndDisplayStockInfo() {
        const shares = document.getElementById('shares').value;
        const stockInfoGroup = document.getElementById('stockInfoGroup');
        
        if (this.currentStockInfo && shares && parseInt(shares) > 0) {
            // Both ticker and shares provided - show stock info
            this.displayStockInfo(this.currentStockInfo);
            stockInfoGroup.style.display = 'block';
            
            // Also calculate trade value
            this.calculateTradeValue();
        } else {
            // Missing ticker or shares - hide displays
            this.hideStockDisplays();
        }
    }

    hideStockDisplays() {
        document.getElementById('stockInfoGroup').style.display = 'none';
        document.getElementById('tradeValueGroup').style.display = 'none';
    }

    async calculateTradeValue() {
        const tradeValueGroup = document.getElementById('tradeValueGroup');
        const shares = document.getElementById('shares').value;
        const tradingType = document.getElementById('trading_type').value;
        
        // Only calculate if we have all required info and should display
        if (!this.currentStockInfo || !shares || shares <= 0) {
            tradeValueGroup.style.display = 'none';
            return;
        }

        try {
            const response = await fetch('/api/stock/calculate', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    ticker: this.currentStockInfo.ticker,
                    shares: parseInt(shares)
                })
            });

            const result = await response.json();

            if (result.success) {
                this.displayTradeValue(result, tradingType || 'buy');
                tradeValueGroup.style.display = 'block';
            } else {
                console.error('Error calculating trade value:', result.error);
                tradeValueGroup.style.display = 'none';
            }
        } catch (error) {
            console.error('Error calculating trade value:', error);
            tradeValueGroup.style.display = 'none';
        }
    }

    displayTradeValue(calculation, tradingType) {
        const tradeValueDiv = document.getElementById('tradeValue');
        
        // Different warnings and validations for buy vs sell
        let warningHtml = '';
        let tradeTypeLabel = tradingType === 'buy' ? 'Purchase Value' : 'Sale Value';
        let tradeTypeClass = tradingType === 'buy' ? 'trade-value-buy' : 'trade-value-sell';
        
        // Show currency conversion if not USD
        let currencyInfo = '';
        if (calculation.currency !== 'USD' && calculation.formatted_total_usd) {
            currencyInfo = `
                <div class="trade-value-item">
                    <span class="trade-value-label">USD Equivalent:</span>
                    <span class="trade-value-amount">${calculation.formatted_total_usd}</span>
                </div>
                <div class="trade-value-item">
                    <span class="trade-value-label">Exchange Rate:</span>
                    <span class="trade-value-amount">1 ${calculation.currency} = $${calculation.exchange_rate?.toFixed(4)}</span>
                </div>
            `;
        }
        
        // Only show max limit warnings for buy orders (using USD values)
        if (tradingType === 'buy') {
            if (calculation.exceeds_max) {
                warningHtml = `
                    <div class="trade-value-error">
                        <strong>⚠️ Purchase Exceeds Maximum Limit</strong><br>
                        Your purchase value of ${calculation.formatted_total_usd || calculation.formatted_total} exceeds the maximum allowed amount of ${calculation.formatted_max}.<br>
                        Maximum shares allowed: ${calculation.max_shares_allowed}
                    </div>
                `;
            } else if (calculation.max_trade_amount && calculation.total_value_usd && calculation.total_value_usd > calculation.max_trade_amount * 0.8) {
                warningHtml = `
                    <div class="trade-value-warning">
                        <strong>⚠️ High Purchase Value</strong><br>
                        Your purchase value is approaching the maximum limit of ${calculation.formatted_max}.
                    </div>
                `;
            }
        }
        
        tradeValueDiv.innerHTML = `
            <div class="trade-value-item">
                <span class="trade-value-label">Price per Share:</span>
                <span class="trade-value-amount">${calculation.formatted_price}</span>
            </div>
            <div class="trade-value-item">
                <span class="trade-value-label">Number of Shares:</span>
                <span class="trade-value-amount">${calculation.shares.toLocaleString()}</span>
            </div>
            <div class="trade-value-item">
                <span class="trade-value-label">${tradeTypeLabel}:</span>
                <span class="trade-value-amount trade-value-total ${tradeTypeClass}">${calculation.formatted_total}</span>
            </div>
            ${currencyInfo}
            ${calculation.max_trade_amount && tradingType === 'buy' ? `
                <div class="trade-value-item">
                    <span class="trade-value-label">Maximum Purchase Allowed:</span>
                    <span class="trade-value-amount">${calculation.formatted_max}</span>
                </div>
            ` : ''}
            ${warningHtml}
        `;
    }

    handleTradingTypeSelection(e) {
        e.preventDefault();
        const button = e.currentTarget;
        const tradingType = button.getAttribute('data-type');
        
        // Remove active class from all buttons
        document.querySelectorAll('.trading-type-btn').forEach(btn => {
            btn.classList.remove('active');
        });
        
        // Add active class to clicked button
        button.classList.add('active');
        
        // Set the hidden input value
        document.getElementById('trading_type').value = tradingType;
        
        // Calculate trade value if all other fields are ready
        this.calculateTradeValue();
    }

    // Stock management methods
    async handleNewStockTicker(e) {
        const ticker = e.target.value.trim().toUpperCase();
        const statusDiv = document.getElementById('newStockStatus');
        const stockInfoDiv = document.getElementById('newStockInfo');
        const addBtn = document.getElementById('addStockBtn');

        if (ticker.length === 0) {
            statusDiv.style.display = 'none';
            stockInfoDiv.style.display = 'none';
            this.newStockData = null;
            addBtn.disabled = false;
            return;
        }

        if (ticker.length < 1) return;

        // Debounce API calls
        clearTimeout(this.newStockTimeout);
        this.newStockTimeout = setTimeout(async () => {
            await this.validateNewStock(ticker);
        }, 500);
    }

    async validateNewStock(ticker) {
        const statusDiv = document.getElementById('newStockStatus');
        const stockInfoDiv = document.getElementById('newStockInfo');
        const addBtn = document.getElementById('addStockBtn');

        // Show loading state
        statusDiv.className = 'ticker-status loading';
        statusDiv.textContent = 'Validating ticker...';
        statusDiv.style.display = 'block';
        stockInfoDiv.style.display = 'none';
        addBtn.disabled = true;

        try {
            const response = await fetch(`/api/stock/info/${encodeURIComponent(ticker)}`);
            const result = await response.json();

            if (result.success) {
                // Valid ticker
                statusDiv.className = 'ticker-status valid';
                statusDiv.textContent = `✓ Valid ticker: ${result.ticker}`;
                
                this.newStockData = result;
                this.displayNewStockInfo(result);
                stockInfoDiv.style.display = 'block';
                addBtn.disabled = false;
                
                // Update form ticker field
                document.getElementById('new_ticker').value = result.ticker;
            } else {
                // Invalid ticker
                statusDiv.className = 'ticker-status invalid';
                statusDiv.textContent = `✗ Invalid ticker: ${result.error || 'Stock not found'}`;
                stockInfoDiv.style.display = 'none';
                this.newStockData = null;
                addBtn.disabled = true;
            }
        } catch (error) {
            console.error('Error validating new stock ticker:', error);
            statusDiv.className = 'ticker-status invalid';
            statusDiv.textContent = '✗ Error validating ticker';
            stockInfoDiv.style.display = 'none';
            this.newStockData = null;
            addBtn.disabled = true;
        }
    }

    displayNewStockInfo(stockInfo) {
        const stockInfoDiv = document.getElementById('newStockInfo');
        
        stockInfoDiv.innerHTML = `
            <div class="stock-info-item">
                <span class="stock-info-label">Company:</span>
                <span class="stock-info-value">${this.escapeHtml(stockInfo.company_name)}</span>
            </div>
            <div class="stock-info-item">
                <span class="stock-info-label">Exchange:</span>
                <span class="stock-info-value">${stockInfo.exchange}</span>
            </div>
            <div class="stock-info-item">
                <span class="stock-info-label">Currency:</span>
                <span class="stock-info-value">${stockInfo.currency}</span>
            </div>
        `;
    }

    // Audit tab functionality
    showAuditTab(tabName) {
        // Update tab buttons
        document.querySelectorAll('.tab-button').forEach(btn => btn.classList.remove('active'));
        event.target.classList.add('active');

        // Hide all tab contents
        document.getElementById('generalAuditTab').style.display = 'none';
        document.getElementById('restrictedListAuditTab').style.display = 'none';

        // Hide all results
        document.getElementById('auditSummary').style.display = 'none';
        document.getElementById('auditResults').style.display = 'none';
        document.getElementById('changelogSummary').style.display = 'none';
        document.getElementById('changelogResults').style.display = 'none';

        // Show selected tab content
        if (tabName === 'general') {
            document.getElementById('generalAuditTab').style.display = 'block';
        } else if (tabName === 'restricted-list') {
            document.getElementById('restrictedListAuditTab').style.display = 'block';
        }
    }

    async searchRestrictedChangelog() {
        try {
            const filters = {};
            const ticker = document.getElementById('changelogTicker').value.trim();
            const action = document.getElementById('changelogAction').value;
            const admin = document.getElementById('changelogAdmin').value.trim();
            const startDate = document.getElementById('changelogStartDate').value;
            const endDate = document.getElementById('changelogEndDate').value;

            if (ticker) filters.ticker = ticker;
            if (action) filters.action = action;
            if (admin) filters.admin_email = admin;
            if (startDate) filters.start_date = startDate;
            if (endDate) filters.end_date = endDate;

            const params = new URLSearchParams(filters);
            const response = await fetch(`/api/restricted-stocks/changelog/filtered?${params}`, {
                credentials: 'include'
            });

            const result = await response.json();

            if (result.success) {
                this.displayChangelogSummary(result.summary);
                this.displayChangelogResults(result.data);
            } else {
                this.showNotification(result.message || 'Error loading changelog', 'error');
            }
        } catch (error) {
            console.error('Error searching changelog:', error);
            this.showNotification('Network error loading changelog', 'error');
        }
    }

    displayChangelogSummary(summary) {
        document.getElementById('totalChanges').textContent = summary.total_changes || 0;
        document.getElementById('totalAdded').textContent = summary.total_added || 0;
        document.getElementById('totalRemoved').textContent = summary.total_removed || 0;
        document.getElementById('uniqueStocksAffected').textContent = summary.unique_stocks_affected || 0;
        document.getElementById('uniqueAdmins').textContent = summary.unique_admins || 0;

        document.getElementById('changelogSummary').style.display = 'block';
    }

    displayChangelogResults(changelog) {
        const container = document.getElementById('changelogList');
        
        if (!changelog || changelog.length === 0) {
            container.innerHTML = '<tr class="loading-row"><td colspan="5" class="loading-cell">No restricted list changes found</td></tr>';
            document.getElementById('changelogResults').style.display = 'block';
            return;
        }

        const changelogHTML = changelog.map(entry => {
            const formattedDate = new Date(entry.created_at).toLocaleDateString('en-US', {
                year: 'numeric',
                month: 'short',
                day: 'numeric'
            });
            const formattedTime = new Date(entry.created_at).toLocaleTimeString('en-US', {
                hour: '2-digit',
                minute: '2-digit'
            });

            return `
                <tr>
                    <td class="table-date">
                        <div>${formattedDate}</div>
                        <div style="font-size: var(--font-size-sm); color: var(--gs-neutral-500);">${formattedTime}</div>
                    </td>
                    <td class="table-ticker">${this.escapeHtml(entry.ticker)}</td>
                    <td class="table-employee">${this.escapeHtml(entry.company_name)}</td>
                    <td>
                        <span class="table-status ${entry.action}">${entry.action.toUpperCase()}</span>
                    </td>
                    <td class="table-employee">${this.escapeHtml(entry.admin_email)}</td>
                </tr>
            `;
        }).join('');

        container.innerHTML = changelogHTML;
        document.getElementById('changelogResults').style.display = 'block';
    }

    async exportRestrictedListChangelog() {
        try {
            const filters = {};
            const ticker = document.getElementById('changelogTicker').value.trim();
            const action = document.getElementById('changelogAction').value;
            const admin = document.getElementById('changelogAdmin').value.trim();
            const startDate = document.getElementById('changelogStartDate').value;
            const endDate = document.getElementById('changelogEndDate').value;

            if (ticker) filters.ticker = ticker;
            if (action) filters.action = action;
            if (admin) filters.admin_email = admin;
            if (startDate) filters.start_date = startDate;
            if (endDate) filters.end_date = endDate;

            const params = new URLSearchParams(filters);
            
            // Create a temporary link to download the file
            const link = document.createElement('a');
            link.href = `/api/restricted-stocks/changelog/export?${params}`;
            link.download = `restricted_list_changelog_${new Date().toISOString().split('T')[0]}.csv`;
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);

            this.showNotification('Changelog export started', 'success');
        } catch (error) {
            console.error('Error exporting changelog:', error);
            this.showNotification('Error exporting changelog', 'error');
        }
    }
}

const app = new TradingApp();
window.app = app; // Make app globally accessible