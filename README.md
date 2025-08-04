# Trading Compliance Portal

A comprehensive web application for managing employee pre-trading approval requests and compliance monitoring, built with Goldman Sachs design principles.

## Features

- **Microsoft 365 Authentication**: Employees must login with inspirationcap.com accounts
- **Employee Request Submission**: Submit trading requests with stock details after authentication
- **Automatic Approval Logic**: Automatically approves/rejects based on restricted stock list
- **Email Notifications**: Sends email notifications to employees about request status
- **Admin Panel**: Secure admin panel with login/password protection for managing restricted stocks list
- **Request History**: View all submitted requests with their status
- **Domain Restriction**: Only @inspirationcap.com email addresses can submit requests
- **SQLite Database**: Lightweight database for storing requests and restricted stocks

## Technology Stack

- **Backend**: Node.js, Express.js
- **Database**: SQLite3
- **Frontend**: Vanilla HTML/CSS/JavaScript
- **Authentication**: Microsoft 365 OAuth (Azure AD)
- **Email**: Nodemailer
- **Security**: Helmet, CORS, Input validation, Domain restrictions

## Installation

1. Navigate to the project directory:
   ```bash
   cd trading_approval
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Copy the environment file and configure:
   ```bash
   cp .env.example .env
   ```

4. **Set up Microsoft 365 App Registration** (see Microsoft 365 Setup section below)

5. Edit `.env` file with your configuration:
   ```
   # Admin credentials (change these!)
   ADMIN_USERNAME=admin
   ADMIN_PASSWORD=admin123
   
   # Microsoft 365 OAuth (required for employee authentication)
   AZURE_CLIENT_ID=your-azure-client-id
   AZURE_CLIENT_SECRET=your-azure-client-secret
   AZURE_TENANT_ID=your-azure-tenant-id
   REDIRECT_URI=http://localhost:3001/api/auth/microsoft/callback
   
   # Email configuration
   EMAIL_USER=your-email@company.com
   EMAIL_PASS=your-app-password
   SMTP_HOST=smtp.gmail.com
   SMTP_PORT=587
   
   # Session security
   SESSION_SECRET=your-secret-key-change-in-production
   ```

## Running the Application

1. Start the server:
   ```bash
   npm start
   ```

2. Open your browser and navigate to:
   ```
   http://localhost:3001
   ```

## Microsoft 365 Setup

To enable employee authentication with inspirationcap.com accounts, you need to register an application in Azure Active Directory:

### Step 1: Register Application in Azure Portal

1. **Go to Azure Portal**: Visit [portal.azure.com](https://portal.azure.com)
2. **Navigate to Azure Active Directory** → **App registrations** → **New registration**
3. **Fill out the form**:
   - **Name**: `Trading Approval System`
   - **Supported account types**: `Accounts in this organizational directory only (inspirationcap.com only)`
   - **Redirect URI**: `Web` → `http://localhost:3001/api/auth/microsoft/callback`
4. **Click Register**

### Step 2: Configure API Permissions

1. **Go to API permissions** → **Add a permission**
2. **Select Microsoft Graph** → **Delegated permissions**
3. **Add these permissions**:
   - `User.Read` (to read user profile)
   - `email` (to get user email)
   - `profile` (to get user name)
4. **Click Add permissions**
5. **Grant admin consent** for the organization

### Step 3: Create Client Secret

1. **Go to Certificates & secrets** → **New client secret**
2. **Add description**: `Trading App Secret`
3. **Set expiration**: `24 months` (recommended)
4. **Click Add**
5. **Copy the secret value** (you won't see it again!)

### Step 4: Get Configuration Values

From your app registration, copy these values to your `.env` file:

- **Application (client) ID** → `AZURE_CLIENT_ID`
- **Directory (tenant) ID** → `AZURE_TENANT_ID`  
- **Client secret value** → `AZURE_CLIENT_SECRET`

### Step 5: Configure Domain Restrictions

The application is configured to only allow `@inspirationcap.com` email addresses. Users with other domains will be rejected even if they can authenticate with Microsoft.

## Admin Authentication

The admin panel is protected with login credentials:

- **Default Username**: `admin`
- **Default Password**: `admin123`

⚠️ **IMPORTANT**: Change these default credentials in your `.env` file before deployment!

To access admin features:
1. Click the "Admin Panel" tab
2. Log in with your credentials
3. Manage restricted stocks and view requests
4. Click "Logout" when finished

## API Endpoints

### Authentication
- `POST /api/auth/login` - Admin login
- `POST /api/auth/logout` - Admin logout  
- `GET /api/auth/check` - Check authentication status

### Trading Requests
- `POST /api/trading/submit` - Submit a trading request
- `GET /api/trading/requests` - Get all requests
- `GET /api/trading/requests/:id` - Get specific request

### Restricted Stocks
- `GET /api/restricted-stocks` - Get all restricted stocks
- `POST /api/restricted-stocks` - Add a restricted stock
- `DELETE /api/restricted-stocks/:ticker` - Remove a restricted stock

## Database Schema

### restricted_stocks
- `id`: Primary key
- `ticker`: Stock ticker (unique)
- `company_name`: Company name
- `created_at`: Creation timestamp

### trading_requests
- `id`: Primary key
- `employee_email`: Employee email address
- `stock_name`: Stock name
- `ticker`: Stock ticker
- `shares`: Number of shares
- `trading_type`: 'buy' or 'sell'
- `status`: 'pending', 'approved', or 'rejected'
- `rejection_reason`: Reason for rejection (if applicable)
- `created_at`: Request creation timestamp
- `processed_at`: Processing timestamp

## How It Works

1. **Employee Authentication**: Employee must first:
   - Click "Sign in with Microsoft 365"
   - Authenticate with their @inspirationcap.com account
   - Get redirected back to the application

2. **Employee Submission**: Authenticated employee fills out the form with:
   - Stock name and ticker (email automatically captured from login)
   - Number of shares
   - Trading type (buy/sell)

3. **Automatic Processing**: System checks if ticker is in restricted list:
   - **Not Restricted**: Automatically approves the request
   - **Restricted**: Automatically rejects the request

4. **Email Notification**: System sends email to employee with:
   - Request details
   - Approval/rejection status
   - Reason for rejection (if applicable)

5. **Database Storage**: All requests are stored for audit and history purposes

## Default Restricted Stocks

The system comes pre-loaded with these restricted stocks:
- TSLA (Tesla Inc.)
- NVDA (NVIDIA Corporation)
- META (Meta Platforms Inc.)

## Security Features

- Input validation and sanitization
- SQL injection prevention
- XSS protection with Helmet
- CORS configuration
- Email address validation
- Rate limiting ready (can be added with express-rate-limit)

## Admin Features

- Add new stocks to restricted list (requires login)
- Remove stocks from restricted list (requires login)
- View all trading requests
- Request history with status tracking
- Secure session-based authentication
- Auto-logout for security

## Email Configuration

For Gmail, you'll need to:
1. Enable 2-factor authentication
2. Generate an app-specific password
3. Use the app password in the EMAIL_PASS environment variable

## Production Considerations

1. **Environment Variables**: Set proper production values
2. **Database**: Consider upgrading to PostgreSQL/MySQL for production
3. **Email Service**: Use a professional email service (SendGrid, AWS SES)
4. **Security**: Add rate limiting, authentication, and audit logging
5. **Monitoring**: Add proper logging and monitoring
6. **SSL**: Enable HTTPS in production

## Troubleshooting

1. **Email not sending**: Check your email credentials and SMTP settings
2. **Database errors**: Ensure SQLite permissions are correct
3. **Port conflicts**: Change PORT in .env if 3001 is in use
4. **CORS issues**: Update FRONTEND_URL in .env for different domains

## License

ISC